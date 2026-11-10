import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, ScanJobStatus, type ScanJob } from '@prisma/client';
import {
  InvalidScanImageError,
  NoFoodDetectedError,
  ScanProvidersUnavailableError,
  calibrationRawItems,
  serializeScanResult,
  type ScanAnalyzer,
  type ScanResult,
} from '@nutriscan/scan-core';
import { PrismaService } from '../../prisma';
import { MAX_DAILY_SCAN_LIMIT, FREE_SCAN_LIMIT } from '../billing/subscription-access';
import { SubscriptionAccessService } from '../billing/subscription-access.service';
import { SCAN_ANALYZER } from './scan-analyzer.provider';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const DAILY_ATTEMPT_LIMIT = 15;
const LEASE_MS = 90 * 1_000;
const JOB_TTL_MS = 30 * 86_400_000;
const FEEDBACK_DAILY_LIMIT = 10;
const FEEDBACK_MIN_INTERVAL_MS = 1_000;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export interface CreateScanInput {
  userId: string;
  idempotencyKey: string;
  contentType: string;
  image: Buffer;
  locale: string;
}

export interface ScanFeedbackInput {
  edited: boolean;
  savedItems: Array<{ name: string; portionG: number }>;
}

export interface SerializedScanJob {
  scanId: string;
  status: ScanJobStatus;
  progress: { phase: 'ANALYZING' | 'COMPLETED' | 'FAILED'; percent: number };
  provider: string | null;
  imageHash: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  reclaimable: boolean;
  retryAfterMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  items?: ReturnType<typeof serializeScanResult>['items'];
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
  totalFiber?: number;
  confidence?: number;
}

@Injectable()
export class ScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SubscriptionAccessService,
    @Inject(SCAN_ANALYZER) private readonly analyzer: ScanAnalyzer | null,
  ) {}

  async create(input: CreateScanInput): Promise<SerializedScanJob> {
    if (!this.analyzer) {
      throw new ServiceUnavailableException({
        code: 'SCAN_NOT_CONFIGURED',
        message: 'Escaneamento temporariamente indisponivel.',
      });
    }
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    validateImageUpload(input.image, input.contentType);
    const scanId = scanIdFromIdempotency(input.userId, key);
    const contentSha256 = sha256Hex(input.image);
    const now = new Date();
    const today = utcDay(now);

    const existing = await this.prisma.scanJob.findUnique({ where: { id: scanId } });
    if (existing) {
      if (existing.userId !== input.userId || existing.contentSha256 !== contentSha256) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
          message: 'A chave de idempotencia ja foi usada com outro conteudo.',
        });
      }
      if (existing.status !== ScanJobStatus.PROCESSING || isLeaseActive(existing, now)) {
        return serializeJob(existing, now);
      }
      if (existing.quotaDay !== today) {
        const canceled = await this.prisma.scanJob.update({
          where: { id: scanId },
          data: { status: ScanJobStatus.CANCELED, leaseToken: null, leaseExpiresAt: null },
        });
        return serializeJob(canceled, new Date());
      }
    }

    const accessDecision = await this.access.getScanAccess(input.userId);
    if (!accessDecision.canScan && !(await this.access.consumeFreeScan(input.userId))) {
      throw new ForbiddenException({
        code: 'FREE_SCAN_LIMIT_REACHED',
        message: `Voce ja usou os ${FREE_SCAN_LIMIT} scans gratuitos. Assine o Premium para continuar escaneando refeicoes.`,
      });
    }

    const leaseToken = randomUUID();
    const claimed = await this.claim({
      scanId,
      userId: input.userId,
      idempotencyHash: idempotencyHash(input.userId, key),
      contentSha256,
      contentType: input.contentType,
      sizeBytes: input.image.length,
      locale: normalizeLocale(input.locale),
      quotaDay: today,
      leaseToken,
      now,
    });
    if (claimed.kind === 'quota_exceeded') {
      throw new ForbiddenException({
        code: 'DAILY_SCAN_LIMIT_REACHED',
        message: `Limite de ${MAX_DAILY_SCAN_LIMIT} scans atingido para hoje.`,
      });
    }
    if (claimed.kind === 'attempt_limit_exceeded') {
      throw new HttpException(
        {
          code: 'DAILY_SCAN_ATTEMPT_LIMIT_REACHED',
          message: 'Limite defensivo de tentativas de scan atingido para hoje.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (claimed.kind === 'existing') return serializeJob(claimed.job, new Date());

    try {
      const output = await this.analyzer.analyze({
        image: input.image,
        locale: claimed.job.locale,
        userId: input.userId,
      });
      const completed = await this.complete(input.userId, scanId, leaseToken, today, output);
      return serializeJob(completed, new Date());
    } catch (error) {
      const failed = await this.fail(input.userId, scanId, leaseToken, scanErrorCode(error));
      return serializeJob(failed, new Date());
    }
  }

  async get(userId: string, scanId: string): Promise<SerializedScanJob> {
    const job = await this.prisma.scanJob.findFirst({ where: { id: requireScanId(scanId), userId } });
    if (!job) throw new NotFoundException({ code: 'SCAN_NOT_FOUND', message: 'Scan nao encontrado.' });
    return serializeJob(job, new Date());
  }

  async cancel(userId: string, scanId: string): Promise<SerializedScanJob> {
    const id = requireScanId(scanId);
    const job = await this.prisma.$transaction(async (tx) => {
      const result = await tx.scanJob.updateMany({
        where: { id, userId, status: ScanJobStatus.PROCESSING },
        data: { status: ScanJobStatus.CANCELED, leaseToken: null, leaseExpiresAt: null },
      });
      if (result.count === 0) return tx.scanJob.findFirst({ where: { id, userId } });
      return tx.scanJob.findUnique({ where: { id } });
    });
    if (!job) throw new NotFoundException({ code: 'SCAN_NOT_FOUND', message: 'Scan nao encontrado.' });
    return serializeJob(job, new Date());
  }

  async getAccess(userId: string) {
    const now = new Date();
    const today = utcDay(now);
    const [accessDecision, usage, freeTier] = await Promise.all([
      this.access.getScanAccess(userId),
      this.usageForDay(userId, today, now),
      this.access.getFreeTierUsage(userId),
    ]);
    const dailyLimit = MAX_DAILY_SCAN_LIMIT;
    const remainingToday = Math.max(0, dailyLimit - usage.completed - usage.activeProcessing);
    const freeScansRemaining = Math.max(0, freeTier.scansLimit - freeTier.scansUsed);
    const canScan = accessDecision.canScan
      ? remainingToday > 0 && usage.attempts < DAILY_ATTEMPT_LIMIT
      : freeScansRemaining > 0;
    return {
      canScan,
      dailyLimit,
      dailyAttemptLimit: DAILY_ATTEMPT_LIMIT,
      usedToday: usage.completed,
      attemptsToday: usage.attempts,
      reservedToday: usage.activeProcessing,
      remainingToday,
      attemptsRemainingToday: Math.max(0, DAILY_ATTEMPT_LIMIT - usage.attempts),
      source: accessDecision.canScan ? ('assertion' as const) : ('free_tier' as const),
      freeScansRemaining,
    };
  }

  async feedback(userId: string, scanId: string, input: ScanFeedbackInput): Promise<{ accepted: true }> {
    const id = requireScanId(scanId);
    const job = await this.prisma.scanJob.findFirst({ where: { id, userId } });
    if (!job) throw new NotFoundException({ code: 'SCAN_NOT_FOUND', message: 'Scan nao encontrado.' });
    if (job.status !== ScanJobStatus.COMPLETED || !job.result) {
      throw new ConflictException({
        code: 'SCAN_NOT_COMPLETED',
        message: 'Feedback exige um scan concluido.',
      });
    }
    if (!Array.isArray(input.savedItems) || input.savedItems.length > 50) {
      throw new BadRequestException({ code: 'FEEDBACK_INVALID', message: 'Itens de feedback invalidos.' });
    }
    const savedItems = input.savedItems.map((item) => {
      const name = item.name?.trim();
      const portionG = Number(item.portionG);
      if (!name || name.length > 160 || !Number.isFinite(portionG) || portionG <= 0 || portionG > 2_000) {
        throw new BadRequestException({ code: 'FEEDBACK_INVALID', message: 'Item de feedback invalido.' });
      }
      return { name, portionG };
    });
    if (!input.edited && savedItems.length > 0) {
      throw new BadRequestException({
        code: 'FEEDBACK_INVALID',
        message: 'Feedback sem edicao nao deve conter itens alterados.',
      });
    }
    const canonicalSavedItems = [...savedItems].sort((left, right) =>
      left.name === right.name ? left.portionG - right.portionG : left.name < right.name ? -1 : 1,
    );
    const payloadHash = sha256Hex(
      Buffer.from(JSON.stringify({ edited: input.edited, savedItems: canonicalSavedItems })),
    );
    const rawItems = calibrationRawItems(job.result as unknown as ScanResult);
    const now = new Date();
    const today = utcDay(now);

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.scanFeedback.findUnique({ where: { scanId: id } });
      if (duplicate) {
        if (duplicate.userId === userId && duplicate.payloadHash === payloadHash) {
          return { accepted: true };
        }
        throw new ConflictException({
          code: 'FEEDBACK_PAYLOAD_MISMATCH',
          message: 'O feedback deste scan ja foi enviado com outro conteudo.',
        });
      }

      await tx.scanFeedbackUsage.upsert({
        where: { userId_quotaDay: { userId, quotaDay: today } },
        create: { userId, quotaDay: today, updatedAt: now },
        update: {},
      });
      const usage = await tx.$queryRaw<Array<{ acceptedCount: number; lastAcceptedAt: Date | null }>>(
        Prisma.sql`SELECT "acceptedCount", "lastAcceptedAt" FROM "scan_feedback_usage"
          WHERE "userId" = ${userId} AND "quotaDay" = ${today} FOR UPDATE`,
      );
      const current = usage[0];
      if (!current) throw new Error('Feedback usage disappeared.');
      if (current.acceptedCount >= FEEDBACK_DAILY_LIMIT) {
        throw new HttpException(
          { code: 'DAILY_FEEDBACK_LIMIT_REACHED', message: 'Limite diario de feedback atingido.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (current.lastAcceptedAt) {
        const retryAfterMs = current.lastAcceptedAt.getTime() + FEEDBACK_MIN_INTERVAL_MS - now.getTime();
        if (retryAfterMs > 0) {
          throw new HttpException(
            { code: 'FEEDBACK_RATE_LIMITED', message: 'Aguarde antes de enviar outro feedback.', retryable: true },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      await tx.scanFeedback.create({
        data: {
          scanId: id,
          userId,
          payloadHash,
          edited: input.edited,
          rawItems: rawItems as unknown as Prisma.InputJsonValue,
          savedItems: canonicalSavedItems as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.scanFeedbackUsage.update({
        where: { userId_quotaDay: { userId, quotaDay: today } },
        data: { acceptedCount: { increment: 1 }, lastAcceptedAt: now },
      });
      return { accepted: true };
    });
  }

  private async usageForDay(
    userId: string,
    quotaDay: string,
    now: Date,
  ): Promise<{ completed: number; attempts: number; activeProcessing: number }> {
    const [usage, activeProcessing] = await Promise.all([
      this.prisma.scanUsage.findUnique({ where: { userId_quotaDay: { userId, quotaDay } } }),
      this.prisma.scanJob.count({
        where: { userId, quotaDay, status: ScanJobStatus.PROCESSING, leaseExpiresAt: { gt: now } },
      }),
    ]);
    return {
      completed: usage?.completed ?? 0,
      attempts: usage?.attempts ?? 0,
      activeProcessing,
    };
  }

  private async claim(input: {
    scanId: string;
    userId: string;
    idempotencyHash: string;
    contentSha256: string;
    contentType: string;
    sizeBytes: number;
    locale: string;
    quotaDay: string;
    leaseToken: string;
    now: Date;
  }): Promise<
    | { kind: 'claimed'; job: ScanJob }
    | { kind: 'existing'; job: ScanJob }
    | { kind: 'quota_exceeded' }
    | { kind: 'attempt_limit_exceeded' }
  > {
    return this.prisma.$transaction(async (tx) => {
      await tx.scanUsage.upsert({
        where: { userId_quotaDay: { userId: input.userId, quotaDay: input.quotaDay } },
        create: { userId: input.userId, quotaDay: input.quotaDay, updatedAt: input.now },
        update: {},
      });
      const usageRows = await tx.$queryRaw<Array<{ completed: number; attempts: number }>>(
        Prisma.sql`SELECT "completed", "attempts" FROM "scan_usage"
          WHERE "userId" = ${input.userId} AND "quotaDay" = ${input.quotaDay} FOR UPDATE`,
      );
      const usage = usageRows[0];
      if (!usage) throw new Error('Scan usage disappeared.');
      const activeProcessing = await tx.scanJob.count({
        where: {
          userId: input.userId,
          quotaDay: input.quotaDay,
          status: ScanJobStatus.PROCESSING,
          leaseExpiresAt: { gt: input.now },
        },
      });
      if (usage.completed + activeProcessing >= MAX_DAILY_SCAN_LIMIT) {
        return { kind: 'quota_exceeded' as const };
      }
      if (usage.attempts >= DAILY_ATTEMPT_LIMIT) {
        return { kind: 'attempt_limit_exceeded' as const };
      }

      const leaseExpiresAt = new Date(input.now.getTime() + LEASE_MS);
      const expiresAt = new Date(input.now.getTime() + JOB_TTL_MS);
      const job = await tx.scanJob.upsert({
        where: { id: input.scanId },
        create: {
          id: input.scanId,
          userId: input.userId,
          idempotencyHash: input.idempotencyHash,
          contentSha256: input.contentSha256,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          locale: input.locale,
          quotaDay: input.quotaDay,
          dailyLimit: MAX_DAILY_SCAN_LIMIT,
          status: ScanJobStatus.PROCESSING,
          leaseToken: input.leaseToken,
          leaseExpiresAt,
          expiresAt,
        },
        update: {
          status: ScanJobStatus.PROCESSING,
          leaseToken: input.leaseToken,
          leaseExpiresAt,
          errorCode: null,
        },
      });
      await tx.scanUsage.update({
        where: { userId_quotaDay: { userId: input.userId, quotaDay: input.quotaDay } },
        data: { attempts: { increment: 1 } },
      });
      return { kind: 'claimed' as const, job };
    });
  }

  private async complete(
    userId: string,
    scanId: string,
    leaseToken: string,
    quotaDay: string,
    output: { result: ScanResult; provider: string; imageHash: string },
  ): Promise<ScanJob> {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.scanJob.findFirst({ where: { id: scanId, userId, leaseToken } });
      if (!job || job.status !== ScanJobStatus.PROCESSING) {
        return (job ?? (await tx.scanJob.findFirstOrThrow({ where: { id: scanId, userId } }))) as ScanJob;
      }
      const usage = await tx.scanUsage.findUnique({ where: { userId_quotaDay: { userId, quotaDay } } });
      if ((usage?.completed ?? 0) >= MAX_DAILY_SCAN_LIMIT) {
        return tx.scanJob.update({
          where: { id: scanId },
          data: {
            status: ScanJobStatus.FAILED_FINAL,
            errorCode: 'DAILY_SCAN_LIMIT_REACHED',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
      }
      const completed = await tx.scanJob.update({
        where: { id: scanId },
        data: {
          status: ScanJobStatus.COMPLETED,
          result: output.result as unknown as Prisma.InputJsonValue,
          provider: output.provider,
          imageHash: output.imageHash,
          errorCode: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      await tx.scanUsage.update({
        where: { userId_quotaDay: { userId, quotaDay } },
        data: { completed: { increment: 1 } },
      });
      return completed;
    });
  }

  private async fail(
    userId: string,
    scanId: string,
    leaseToken: string,
    errorCode: string,
  ): Promise<ScanJob> {
    const result = await this.prisma.scanJob.updateMany({
      where: { id: scanId, userId, leaseToken, status: ScanJobStatus.PROCESSING },
      data: { status: ScanJobStatus.FAILED_FINAL, errorCode, leaseToken: null, leaseExpiresAt: null },
    });
    const job = await this.prisma.scanJob.findFirst({ where: { id: scanId, userId } });
    if (!job) throw new Error('Scan job disappeared during failure handling.');
    if (result.count === 0 && job.status === ScanJobStatus.PROCESSING) {
      // Lease was reclaimed by another attempt before we could mark failure - leave it alone.
      return job;
    }
    return job;
  }
}

function isLeaseActive(job: ScanJob, now: Date): boolean {
  return Boolean(job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now.getTime());
}

function serializeJob(job: ScanJob, now: Date): SerializedScanJob {
  if (job.status === ScanJobStatus.COMPLETED && job.result) {
    return {
      scanId: job.id,
      status: job.status,
      progress: { phase: 'COMPLETED', percent: 100 },
      provider: job.provider,
      imageHash: job.imageHash,
      error: null,
      reclaimable: false,
      retryAfterMs: null,
      ...serializeScanResult(job.result as unknown as ScanResult, job.id),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
  const leaseRemainingMs =
    job.status === ScanJobStatus.PROCESSING
      ? Math.max(0, (job.leaseExpiresAt?.getTime() ?? 0) - now.getTime())
      : 0;
  const reclaimable = job.status === ScanJobStatus.PROCESSING && leaseRemainingMs === 0;
  return {
    scanId: job.id,
    status: job.status,
    progress:
      job.status === ScanJobStatus.PROCESSING
        ? { phase: 'ANALYZING', percent: 65 }
        : { phase: 'FAILED', percent: 100 },
    provider: job.provider,
    imageHash: job.imageHash,
    error: job.status === ScanJobStatus.FAILED_FINAL ? publicScanError(job.errorCode) : null,
    reclaimable,
    retryAfterMs:
      job.status === ScanJobStatus.PROCESSING
        ? reclaimable
          ? 0
          : Math.min(2_000, Math.max(300, leaseRemainingMs))
        : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function publicScanError(code: string | null) {
  if (code === 'NO_FOOD_DETECTED') {
    return { code, message: 'Nenhum alimento foi identificado na imagem.', retryable: false };
  }
  if (code === 'DAILY_SCAN_LIMIT_REACHED') {
    return { code, message: `Limite de ${MAX_DAILY_SCAN_LIMIT} scans atingido para hoje.`, retryable: false };
  }
  if (code === 'IMAGE_INVALID') {
    return { code, message: 'Imagem invalida, corrompida ou nao suportada.', retryable: false };
  }
  return {
    code: 'SCAN_PROCESSING_FAILED',
    message: 'Nao foi possivel analisar a imagem. Inicie um novo scan.',
    retryable: false,
  };
}

function scanErrorCode(error: unknown): string {
  if (error instanceof NoFoodDetectedError) return error.code;
  if (error instanceof InvalidScanImageError) return error.code;
  if (error instanceof ScanProvidersUnavailableError) return error.code;
  return 'SCAN_PROCESSING_FAILED';
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Header Idempotency-Key obrigatorio.',
    });
  }
  if (normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_INVALID',
      message: 'Header Idempotency-Key invalido.',
    });
  }
  return normalized;
}

function validateImageUpload(image: Buffer, contentType: string): void {
  if (!image.length) {
    throw new BadRequestException({ code: 'IMAGE_REQUIRED', message: 'Imagem obrigatoria.' });
  }
  if (image.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException({
      code: 'IMAGE_TOO_LARGE',
      message: 'Imagem excede o limite de 5 MiB.',
    });
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    throw new BadRequestException({
      code: 'IMAGE_TYPE_UNSUPPORTED',
      message: 'Formato de imagem nao suportado.',
    });
  }
}

function normalizeLocale(locale: string): string {
  const first = locale.trim().split(',')[0]?.split(';')[0]?.trim();
  return first && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(first) ? first : 'en';
}

function requireScanId(value: string): string {
  if (!value || !/^[A-Za-z0-9_-]{20,80}$/.test(value)) {
    throw new BadRequestException({
      code: 'SCAN_ID_INVALID',
      message: 'Identificador de scan invalido.',
    });
  }
  return value;
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function idempotencyHash(userId: string, key: string): string {
  return createHash('sha256').update(`${userId}\u0000${key}`).digest('hex');
}

function scanIdFromIdempotency(userId: string, key: string): string {
  return createHash('sha256').update(`${userId}\u0000${key}`).digest('base64url');
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
