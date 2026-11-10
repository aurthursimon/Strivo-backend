import { Logger } from '@nestjs/common';
import {
  GeminiProvider,
  OpenAiProvider,
  ScanAnalyzer,
  SharpScanImageProcessor,
  buildPortionCalibrationProfile,
  type CalibrationFeedbackEvent,
  type ScanCoreLogger,
} from '@nutriscan/scan-core';
import type { Env } from '../../config';
import { PrismaService } from '../../prisma';

export const SCAN_ANALYZER = Symbol('SCAN_ANALYZER');

const CALIBRATION_HISTORY_LIMIT = 40;

class NestScanCoreLogger implements ScanCoreLogger {
  private readonly logger = new Logger('ScanAnalyzer');

  info(fields: Record<string, unknown>, message: string): void {
    this.logger.log({ ...fields, message });
  }

  warn(fields: Record<string, unknown>, message: string): void {
    this.logger.warn({ ...fields, message });
  }

  error(fields: Record<string, unknown>, message: string): void {
    this.logger.error({ ...fields, message });
  }
}

/**
 * Loads this user's last CALIBRATION_HISTORY_LIMIT accepted scan-feedback
 * events and folds them into a portion-correction profile. ScanAnalyzer
 * races this against its own short internal timeout, so a slow/unavailable
 * DB just means this scan skips calibration rather than failing outright.
 */
function buildCalibrationLoader(prisma: PrismaService) {
  return {
    async loadProfile(userId: string) {
      const rows = await prisma.scanFeedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: CALIBRATION_HISTORY_LIMIT,
        select: { rawItems: true, savedItems: true },
      });
      const events: CalibrationFeedbackEvent[] = rows.map((row) => ({
        rawItems: asCalibrationRawItems(row.rawItems),
        savedItems: asCalibrationSavedItems(row.savedItems),
      }));
      const profile = buildPortionCalibrationProfile(events);
      return profile.byFood.size ? profile : undefined;
    },
  };
}

function asCalibrationRawItems(value: unknown): CalibrationFeedbackEvent['rawItems'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = typeof item?.name === 'string' ? item.name : '';
    const estimatedPortionG = Number(item?.estimatedPortionG);
    return name && Number.isFinite(estimatedPortionG) && estimatedPortionG > 0
      ? [{ name, estimatedPortionG }]
      : [];
  });
}

function asCalibrationSavedItems(value: unknown): CalibrationFeedbackEvent['savedItems'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = typeof item?.name === 'string' ? item.name : '';
    const portionG = Number(item?.portionG);
    return name && Number.isFinite(portionG) && portionG > 0 ? [{ name, portionG }] : [];
  });
}

// Either key alone is enough to run the scanner on a single provider - only
// with BOTH configured does Gemini become primary with OpenAI as fallback.
// Lets a deployment run on just OpenAI (or just Gemini) without a second key
// that exists purely to satisfy a "both or neither" requirement.
export function createScanAnalyzer(env: Env, prisma: PrismaService): ScanAnalyzer | null {
  const gemini = env.GEMINI_API_KEY
    ? new GeminiProvider({ apiKey: env.GEMINI_API_KEY, defaultModel: env.GEMINI_MODEL })
    : null;
  const openai = env.OPENAI_API_KEY
    ? new OpenAiProvider({ apiKey: env.OPENAI_API_KEY, defaultModel: env.OPENAI_SCAN_MODEL })
    : null;
  if (!gemini && !openai) return null;

  const shared = {
    imageProcessor: new SharpScanImageProcessor(),
    calibration: buildCalibrationLoader(prisma),
    logger: new NestScanCoreLogger(),
    primaryTimeoutMs: env.SCAN_PRIMARY_TIMEOUT_MS,
    fallbackTimeoutMs: env.SCAN_FALLBACK_TIMEOUT_MS,
  };
  if (gemini && openai) {
    return new ScanAnalyzer({ ...shared, primary: gemini, fallback: openai });
  }
  return new ScanAnalyzer({ ...shared, primary: (gemini ?? openai)! });
}
