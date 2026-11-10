import { Injectable } from '@nestjs/common';
import { Prisma, ScanAccountCleanupStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma';
import type { StoredAppleRevocationCredential } from '../auth/auth.service';

const DEFAULT_LEASE_SECONDS = 120;
const COMPLETED_RETENTION_DAYS = 30;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1_000;

export interface ClaimedScanAccountCleanupTask {
  id: string;
  subjectId: string;
  subjectHash: string;
  accountGeneration: number;
  appleRevocationRequired: boolean;
  appleCredential?: StoredAppleRevocationCredential;
  appleRevokedAt?: Date;
  revenueCatDeletedAt?: Date;
  attempts: number;
  leaseToken: string;
}

interface ClaimedRow {
  id: string;
  subjectId: string | null;
  subjectHash: string;
  accountGeneration: number;
  appleRevocationRequired: boolean;
  appleTokenCiphertext: string | null;
  appleTokenIv: string | null;
  appleTokenTag: string | null;
  appleTokenType: string | null;
  appleTokenKeyId: string | null;
  appleRevokedAt: Date | null;
  revenueCatDeletedAt: Date | null;
  attempts: number;
  leaseToken: string;
}

@Injectable()
export class ScanAccountCleanupOutbox {
  constructor(private readonly prisma: PrismaService) {}

  async claimBatch(
    limit = 5,
    leaseSeconds = DEFAULT_LEASE_SECONDS,
  ): Promise<ClaimedScanAccountCleanupTask[]> {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "scan_account_cleanup_tasks"
        WHERE "nextAttemptAt" <= NOW()
          AND (
            "status" IN (
              'PENDING'::"ScanAccountCleanupStatus",
              'RETRY'::"ScanAccountCleanupStatus"
            )
            OR (
              "status" = 'PROCESSING'::"ScanAccountCleanupStatus"
              AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= NOW())
            )
          )
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE "scan_account_cleanup_tasks" AS task
      SET
        "status" = 'PROCESSING'::"ScanAccountCleanupStatus",
        "attempts" = task."attempts" + 1,
        "leaseToken" = ${leaseToken}::uuid,
        "leaseExpiresAt" = NOW() + make_interval(secs => ${leaseSeconds}),
        "lastAttemptAt" = NOW(),
        "updatedAt" = NOW()
      FROM candidates
      WHERE task."id" = candidates."id"
      RETURNING
        task."id",
        task."subjectId",
        task."subjectHash",
        task."accountGeneration",
        task."appleRevocationRequired",
        task."appleTokenCiphertext",
        task."appleTokenIv",
        task."appleTokenTag",
        task."appleTokenType",
        task."appleTokenKeyId",
        task."appleRevokedAt",
        task."revenueCatDeletedAt",
        task."attempts",
        task."leaseToken"
    `);

    return rows.map((row) => {
      if (!row.subjectId) throw new Error('Claimed account cleanup task has no subject id');
      return {
        id: row.id,
        subjectId: row.subjectId,
        subjectHash: row.subjectHash,
        accountGeneration: row.accountGeneration,
        appleRevocationRequired: row.appleRevocationRequired,
        ...claimedAppleCredential(row),
        ...(row.appleRevokedAt ? { appleRevokedAt: row.appleRevokedAt } : {}),
        ...(row.revenueCatDeletedAt ? { revenueCatDeletedAt: row.revenueCatDeletedAt } : {}),
        attempts: row.attempts,
        leaseToken: row.leaseToken,
      };
    });
  }

  async complete(task: ClaimedScanAccountCleanupTask, now = new Date()): Promise<boolean> {
    const result = await this.prisma.scanAccountCleanupTask.updateMany({
      where: {
        id: task.id,
        leaseToken: task.leaseToken,
        status: ScanAccountCleanupStatus.PROCESSING,
        revenueCatDeletedAt: { not: null },
        OR: [
          { appleRevocationRequired: false },
          { appleRevocationRequired: true, appleRevokedAt: { not: null } },
        ],
      },
      data: {
        status: ScanAccountCleanupStatus.COMPLETED,
        subjectId: null,
        providerSubjectHash: null,
        appleTokenCiphertext: null,
        appleTokenIv: null,
        appleTokenTag: null,
        appleTokenType: null,
        appleTokenKeyId: null,
        completedAt: now,
        nextAttemptAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
      },
    });
    return result.count === 1;
  }

  async markAppleRevoked(task: ClaimedScanAccountCleanupTask, now = new Date()): Promise<boolean> {
    return this.markStep(task, {
      appleRevokedAt: now,
      appleTokenCiphertext: null,
      appleTokenIv: null,
      appleTokenTag: null,
      appleTokenType: null,
      appleTokenKeyId: null,
    });
  }

  async markRevenueCatDeleted(
    task: ClaimedScanAccountCleanupTask,
    now = new Date(),
  ): Promise<boolean> {
    return this.markStep(task, { revenueCatDeletedAt: now });
  }

  async retry(
    task: ClaimedScanAccountCleanupTask,
    errorCode: string,
    now = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.scanAccountCleanupTask.updateMany({
      where: {
        id: task.id,
        leaseToken: task.leaseToken,
        status: ScanAccountCleanupStatus.PROCESSING,
      },
      data: {
        status: ScanAccountCleanupStatus.RETRY,
        nextAttemptAt: new Date(now.getTime() + scanCleanupBackoffMs(task.attempts, task.id)),
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: normalizeErrorCode(errorCode),
      },
    });
    return result.count === 1;
  }

  async pruneCompleted(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
    const result = await this.prisma.scanAccountCleanupTask.deleteMany({
      where: {
        status: ScanAccountCleanupStatus.COMPLETED,
        completedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  private async markStep(
    task: ClaimedScanAccountCleanupTask,
    data: Prisma.ScanAccountCleanupTaskUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.prisma.scanAccountCleanupTask.updateMany({
      where: {
        id: task.id,
        leaseToken: task.leaseToken,
        status: ScanAccountCleanupStatus.PROCESSING,
      },
      data,
    });
    return result.count === 1;
  }
}

export function scanCleanupBackoffMs(attempts: number, taskId = ''): number {
  const exponent = Math.max(0, Math.min(20, attempts - 1));
  const baseDelay = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** exponent);
  const digest = createHash('sha256').update(taskId).digest();
  const jitterRatio = 0.8 + digest.readUInt32BE(0) / 0xffffffff / 2.5;
  return Math.min(MAX_BACKOFF_MS, Math.round(baseDelay * jitterRatio));
}

function normalizeErrorCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 64);
  return normalized || 'SCAN_CLOUD_UNEXPECTED';
}

function claimedAppleCredential(
  row: ClaimedRow,
): { appleCredential: StoredAppleRevocationCredential } | Record<string, never> {
  if (
    typeof row.appleTokenCiphertext !== 'string' ||
    typeof row.appleTokenIv !== 'string' ||
    typeof row.appleTokenTag !== 'string' ||
    typeof row.appleTokenType !== 'string'
  ) {
    return {};
  }
  return {
    appleCredential: {
      tokenCiphertext: row.appleTokenCiphertext,
      tokenIv: row.appleTokenIv,
      tokenTag: row.appleTokenTag,
      tokenType: row.appleTokenType,
      ...(row.appleTokenKeyId ? { tokenKeyId: row.appleTokenKeyId } : {}),
    },
  };
}
