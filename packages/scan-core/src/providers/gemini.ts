import { GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai';
import { setTimeout as sleep } from 'node:timers/promises';
import { DEFAULT_GEMINI_SCAN_MODEL, GEMINI_SCAN_MAX_OUTPUT_TOKENS } from '../constants';
import { buildFastGeminiScanPrompt } from '../prompt';
import { SCAN_RESPONSE_JSON_SCHEMA } from '../response-schema';
import type { AnalyzeOptions, ScanResult, VisionProvider } from '../types';
import { validateScanResult } from '../validator';

export interface GeminiProviderOptions {
  apiKey: string;
  defaultModel?: string;
}

export function buildGeminiScanConfig(
  model: string,
  reasoningEffort: 'medium' | 'high' = 'medium',
  signal?: AbortSignal,
  overrides: {
    thinkingBudget?: number;
    maxOutputTokens?: number;
    legacyUnconfigured?: boolean;
  } = {},
) {
  const useFastProfile = overrides.legacyUnconfigured || model === DEFAULT_GEMINI_SCAN_MODEL;
  if (useFastProfile) {
    return {
      ...(signal ? { abortSignal: signal } : {}),
      thinkingConfig: { thinkingBudget: overrides.thinkingBudget ?? 0 },
      maxOutputTokens: overrides.maxOutputTokens ?? GEMINI_SCAN_MAX_OUTPUT_TOKENS,
    };
  }

  const thinkingConfig =
    overrides.thinkingBudget !== undefined
      ? { thinkingBudget: overrides.thinkingBudget }
      : model.startsWith('gemini-3')
        ? {
            thinkingLevel: reasoningEffort === 'high' ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
          }
        : { thinkingBudget: -1 };

  return {
    ...(signal ? { abortSignal: signal } : {}),
    responseMimeType: 'application/json',
    responseJsonSchema: SCAN_RESPONSE_JSON_SCHEMA,
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
    thinkingConfig,
    temperature: 0.1,
    maxOutputTokens: overrides.maxOutputTokens ?? 8_192,
  };
}

export class GeminiProvider implements VisionProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;
  private readonly defaultModel: string;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey.trim()) throw new Error('Gemini API key is required.');
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.defaultModel = options.defaultModel?.trim() || DEFAULT_GEMINI_SCAN_MODEL;
  }

  async analyze(
    imageBuffer: Buffer,
    locale: string,
    options: AnalyzeOptions = {},
  ): Promise<ScanResult> {
    const model = options.model?.trim() || this.defaultModel;
    const prompt = options.promptOverride ?? buildFastGeminiScanPrompt(locale);
    const response = await this.withRetry(
      (signal) =>
        this.client.models.generateContent({
          model,
          config: buildGeminiScanConfig(model, options.reasoningEffort, signal, {
            thinkingBudget: options.geminiThinkingBudget,
            maxOutputTokens: options.maxOutputTokens,
            legacyUnconfigured: options.geminiLegacyUnconfigured,
          }),
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: imageBuffer.toString('base64'),
                  },
                },
                { text: prompt },
              ],
            },
          ],
        }),
      options.timeoutMs,
    );

    const usage = response.usageMetadata;
    options.onUsage?.({
      provider: this.name,
      model,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      reasoningTokens: usage?.thoughtsTokenCount ?? 0,
    });

    return validateScanResult(parseJsonResponse(response.text ?? ''));
  }

  private async withRetry<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    timeoutMs?: number,
  ): Promise<T> {
    const controller = timeoutMs ? new AbortController() : undefined;
    const timeout = timeoutMs
      ? globalThis.setTimeout(() => controller?.abort(), timeoutMs)
      : undefined;
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await operation(controller?.signal);
        } catch (error) {
          if (attempt >= 1 || !isRetryableGeminiError(error)) throw error;
          await sleep(250, undefined, { signal: controller?.signal });
        }
      }
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }
  }
}

function parseJsonResponse(text: string): ScanResult {
  const json = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(json) as ScanResult;
}

function isRetryableGeminiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; code?: number; message?: string };
  if (candidate.status === 429 || candidate.status === 503) return true;
  if (candidate.code === 429 || candidate.code === 503) return true;
  const message = candidate.message ?? '';
  return (
    message.includes('"code":429') ||
    message.includes('"code":503') ||
    message.includes('"status":"UNAVAILABLE"') ||
    message.includes('"status":"RESOURCE_EXHAUSTED"')
  );
}
