import { Injectable } from '@nestjs/common';
import { Prisma, SyncMutationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { SYNC_CHANGE_RETENTION_DAYS, SYNC_MUTATION_RETENTION_DAYS } from './sync.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SyncMaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()) {
    const terminalMutationCutoff = new Date(now.getTime() - SYNC_MUTATION_RETENTION_DAYS * DAY_MS);
    const journalCutoff = new Date(now.getTime() - SYNC_CHANGE_RETENTION_DAYS * DAY_MS);

    return this.prisma.$transaction(async (tx) => {
      const bootstrapSessions = await tx.syncBootstrapSession.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      const [terminalMutations, expiredJournal, activeBootstrap] = await Promise.all([
        tx.syncMutation.deleteMany({
          where: {
            status: { in: [SyncMutationStatus.APPLIED, SyncMutationStatus.REJECTED] },
            processedAt: { lt: terminalMutationCutoff },
          },
        }),
        tx.syncChange.aggregate({
          where: { createdAt: { lt: journalCutoff } },
          _max: { revision: true },
        }),
        tx.syncBootstrapSession.aggregate({
          where: { expiresAt: { gte: now } },
          _min: { snapshotRevision: true },
        }),
      ]);

      const expiredRevision = expiredJournal._max.revision;
      const protectedSnapshot = activeBootstrap._min.snapshotRevision;
      const expiredThroughRevision =
        expiredRevision === null
          ? null
          : protectedSnapshot === null || expiredRevision <= protectedSnapshot
            ? expiredRevision
            : protectedSnapshot;
      let prunedJournalChanges = 0;
      if (expiredThroughRevision !== null) {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "sync_state"
            SET
              "retentionFloor" = GREATEST("retentionFloor", ${expiredThroughRevision}),
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = 1
          `,
        );
        const deleted = await tx.syncChange.deleteMany({
          where: {
            createdAt: { lt: journalCutoff },
            revision: { lte: expiredThroughRevision },
          },
        });
        prunedJournalChanges = deleted.count;
      }

      return {
        expiredBootstrapSessions: bootstrapSessions.count,
        expiredTerminalMutations: terminalMutations.count,
        prunedJournalChanges,
        retentionFloor: expiredThroughRevision?.toString() ?? null,
      };
    });
  }
}
