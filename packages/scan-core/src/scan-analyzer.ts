import { NoFoodDetectedError, ScanProvidersUnavailableError } from './errors';
import { applyPortionCalibration } from './portion-calibration';
import { operationalErrorFingerprint } from './security';
import type {
  AiUsage,
  AnalyzeMealInput,
  AnalyzeMealOutput,
  PortionCalibrationLoader,
  ScanCoreLogger,
  ScanImageProcessor,
  VisionProvider,
} from './types';

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
  halfOpenProbeInFlight: boolean;
}

class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(`${provider} circuit open`);
    this.name = 'CircuitOpenError';
  }
}

export interface ScanAnalyzerOptions {
  imageProcessor: ScanImageProcessor;
  primary: VisionProvider;
  // Optional so a deployment can run on a single provider (e.g. only OpenAI
  // configured) without a second key just to satisfy a type. When absent,
  // a primary failure goes straight to ScanProvidersUnavailableError - there
  // is nothing left to fall back to.
  fallback?: VisionProvider;
  calibration?: PortionCalibrationLoader;
  logger?: ScanCoreLogger;
  primaryTimeoutMs?: number;
  fallbackTimeoutMs?: number;
  calibrationTimeoutMs?: number;
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
  now?: () => number;
}

export class ScanAnalyzer {
  private readonly circuitState = new Map<string, CircuitState>();
  private readonly now: () => number;

  constructor(private readonly options: ScanAnalyzerOptions) {
    this.now = options.now ?? Date.now;
  }

  async analyze(input: AnalyzeMealInput): Promise<AnalyzeMealOutput> {
    const processed = await this.options.imageProcessor.process(input.image);
    const calibration = this.loadCalibration(input.userId);
    let primaryUsage: AiUsage | undefined;
    const primaryStartedAt = this.now();

    try {
      this.acquireCircuitPermit(this.options.primary.name);
      const raw = await this.options.primary.analyze(processed.buffer, input.locale, {
        timeoutMs: this.options.primaryTimeoutMs ?? 6_000,
        onUsage: (usage) => {
          primaryUsage = usage;
        },
      });
      this.recordSuccess(this.options.primary.name);
      const result = applyPortionCalibration(raw, await calibration);
      this.options.logger?.info(
        {
          provider: this.options.primary.name,
          durationMs: Math.max(0, this.now() - primaryStartedAt),
          itemCount: result.items.length,
          confidence: result.overall_confidence,
          ...usageLogFields(primaryUsage),
        },
        'Scan provider completed.',
      );
      return {
        result,
        provider: this.options.primary.name,
        imageHash: processed.perceptualHash,
      };
    } catch (primaryError) {
      if (primaryError instanceof NoFoodDetectedError) {
        this.recordSuccess(this.options.primary.name);
        this.options.logger?.info(
          {
            provider: this.options.primary.name,
            durationMs: Math.max(0, this.now() - primaryStartedAt),
            containsFood: false,
            ...usageLogFields(primaryUsage),
          },
          'Scan provider classified no food.',
        );
        throw primaryError;
      }
      if (!(primaryError instanceof CircuitOpenError)) {
        this.recordFailure(this.options.primary.name);
      }
      this.options.logger?.warn(
        {
          provider: this.options.primary.name,
          durationMs: Math.max(0, this.now() - primaryStartedAt),
          errorFingerprint: operationalErrorFingerprint(primaryError),
          ...usageLogFields(primaryUsage),
        },
        'Primary scan provider failed.',
      );

      if (!this.options.fallback) {
        this.options.logger?.error(
          {
            primaryProvider: this.options.primary.name,
            primaryErrorFingerprint: operationalErrorFingerprint(primaryError),
            ...prefixedUsageLogFields('primary', primaryUsage),
          },
          'All scan providers failed.',
        );
        throw new ScanProvidersUnavailableError();
      }

      let fallbackUsage: AiUsage | undefined;
      const fallbackStartedAt = this.now();
      try {
        this.acquireCircuitPermit(this.options.fallback.name);
        const raw = await this.options.fallback.analyze(processed.buffer, input.locale, {
          timeoutMs: this.options.fallbackTimeoutMs ?? 8_000,
          onUsage: (usage) => {
            fallbackUsage = usage;
          },
        });
        this.recordSuccess(this.options.fallback.name);
        const result = applyPortionCalibration(raw, await calibration);
        this.options.logger?.info(
          {
            provider: this.options.fallback.name,
            durationMs: Math.max(0, this.now() - fallbackStartedAt),
            itemCount: result.items.length,
            confidence: result.overall_confidence,
            ...usageLogFields(fallbackUsage),
          },
          'Fallback scan provider completed.',
        );
        return {
          result,
          provider: this.options.fallback.name,
          imageHash: processed.perceptualHash,
        };
      } catch (fallbackError) {
        if (fallbackError instanceof NoFoodDetectedError) {
          this.recordSuccess(this.options.fallback.name);
          this.options.logger?.info(
            {
              provider: this.options.fallback.name,
              durationMs: Math.max(0, this.now() - fallbackStartedAt),
              containsFood: false,
              ...usageLogFields(fallbackUsage),
            },
            'Fallback scan provider classified no food.',
          );
          throw fallbackError;
        }
        if (!(fallbackError instanceof CircuitOpenError)) {
          this.recordFailure(this.options.fallback.name);
        }
        this.options.logger?.error(
          {
            primaryProvider: this.options.primary.name,
            fallbackProvider: this.options.fallback.name,
            fallbackDurationMs: Math.max(0, this.now() - fallbackStartedAt),
            primaryErrorFingerprint: operationalErrorFingerprint(primaryError),
            fallbackErrorFingerprint: operationalErrorFingerprint(fallbackError),
            ...prefixedUsageLogFields('primary', primaryUsage),
            ...prefixedUsageLogFields('fallback', fallbackUsage),
          },
          'All scan providers failed.',
        );
        throw new ScanProvidersUnavailableError();
      }
    }
  }

  private async loadCalibration(userId: string) {
    if (!this.options.calibration) return undefined;
    let timeout: number | undefined;
    const deadline = new Promise<undefined>((resolve) => {
      timeout = globalThis.setTimeout(resolve, this.options.calibrationTimeoutMs ?? 200);
    });
    try {
      return await Promise.race([
        this.options.calibration.loadProfile(userId).catch((error) => {
          this.options.logger?.warn(
            { errorFingerprint: operationalErrorFingerprint(error) },
            'Portion calibration unavailable.',
          );
          return undefined;
        }),
        deadline,
      ]);
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }
  }

  private acquireCircuitPermit(provider: string): void {
    const state = this.circuitState.get(provider);
    if (!state) return;
    const now = this.now();
    if (state.openUntil <= 0) return;
    if (state.openUntil > now) throw new CircuitOpenError(provider);
    if (state.halfOpenProbeInFlight) throw new CircuitOpenError(provider);
    this.circuitState.set(provider, {
      ...state,
      halfOpenProbeInFlight: true,
    });
  }

  private recordSuccess(provider: string): void {
    this.circuitState.delete(provider);
  }

  private recordFailure(provider: string): void {
    const previous = this.circuitState.get(provider);
    const threshold = this.options.circuitFailureThreshold ?? 5;
    if (previous?.halfOpenProbeInFlight) {
      this.circuitState.set(provider, {
        consecutiveFailures: Math.max(previous.consecutiveFailures, threshold),
        openUntil: this.now() + (this.options.circuitOpenMs ?? 60_000),
        halfOpenProbeInFlight: false,
      });
      return;
    }
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    this.circuitState.set(provider, {
      consecutiveFailures,
      openUntil:
        consecutiveFailures >= threshold ? this.now() + (this.options.circuitOpenMs ?? 60_000) : 0,
      halfOpenProbeInFlight: false,
    });
  }
}

function usageLogFields(usage: AiUsage | undefined): Record<string, unknown> {
  if (!usage) return {};
  return {
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
  };
}

function prefixedUsageLogFields(
  prefix: 'primary' | 'fallback',
  usage: AiUsage | undefined,
): Record<string, unknown> {
  if (!usage) return {};
  return {
    [`${prefix}Model`]: usage.model,
    [`${prefix}InputTokens`]: usage.inputTokens,
    [`${prefix}OutputTokens`]: usage.outputTokens,
    [`${prefix}ReasoningTokens`]: usage.reasoningTokens,
  };
}
