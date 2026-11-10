import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  requiredNumber,
} from './payload-validation';
import { getOrCreateDailyLog, lockSyncUser } from './daily-log-sync';

@Injectable()
export class WaterAddSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.WATER_ADD;

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    assertExactPayload(mutation.payload, ['amountMl', 'legacyClientMutationId']);
    const amountMl = requiredNumber(mutation.payload, 'amountMl', 1, 5000, true);
    const legacyClientMutationId = this.legacyClientMutationId(mutation.payload);

    await lockSyncUser(tx, userId);

    if (legacyClientMutationId) {
      const legacyEntry = await tx.waterEntry.findUnique({
        where: {
          userId_clientMutationId: { userId, clientMutationId: legacyClientMutationId },
        },
        include: { dailyLog: { select: { date: true } } },
      });
      if (legacyEntry) {
        if (legacyEntry.amountMl !== amountMl) {
          throw new SyncOperationRejectedError(
            'SYNC_LEGACY_MUTATION_ID_CONFLICT',
            'legacyClientMutationId ja foi usado com outro valor de agua.',
          );
        }
        return this.existingEntryDraft(legacyEntry);
      }
    }

    const existingMutation = await tx.waterEntry.findUnique({
      where: { userId_clientMutationId: { userId, clientMutationId: mutation.mutationId } },
      include: { dailyLog: { select: { date: true } } },
    });
    if (existingMutation) {
      if (existingMutation.amountMl !== amountMl) {
        throw new SyncOperationRejectedError(
          'SYNC_MUTATION_ID_REUSED',
          'A mutationId da entrada de agua ja foi usada com outro valor.',
        );
      }
      return this.existingEntryDraft(existingMutation);
    }

    const existing = await tx.waterEntry.findUnique({ where: { id: mutation.entityId } });
    if (existing) {
      throw new SyncOperationRejectedError(
        'SYNC_ENTITY_ID_CONFLICT',
        'O identificador da entrada de agua ja esta em uso.',
      );
    }

    const { dailyLog, date } = await getOrCreateDailyLog(
      tx,
      userId,
      occurredAt,
      context.dayOverride,
    );
    const entry = await tx.waterEntry.create({
      data: {
        id: mutation.entityId,
        userId,
        dailyLogId: dailyLog.id,
        amountMl,
        clientMutationId: mutation.mutationId,
        loggedAt: occurredAt,
      },
    });
    await tx.dailyLog.update({
      where: { id: dailyLog.id },
      data: { totalWaterMl: { increment: amountMl } },
    });

    return {
      entityType: 'WATER_ENTRY',
      entityId: entry.id,
      action: 'UPSERT',
      data: {
        id: entry.id,
        amountMl: entry.amountMl,
        loggedAt: entry.loggedAt.toISOString(),
        day: date.toISOString().slice(0, 10),
      },
    };
  }

  private legacyClientMutationId(payload: Record<string, unknown>): string | undefined {
    const value = payload.legacyClientMutationId;
    if (value === undefined) return undefined;
    if (
      typeof value !== 'string' ||
      value.length < 1 ||
      value.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
    ) {
      throw new SyncOperationRejectedError(
        'SYNC_LEGACY_MUTATION_ID_INVALID',
        'legacyClientMutationId deve ter de 1 a 128 caracteres seguros.',
      );
    }
    return value;
  }

  private existingEntryDraft(entry: {
    id: string;
    amountMl: number;
    loggedAt: Date;
    dailyLog: { date: Date };
  }): SyncChangeDraft {
    return {
      entityType: 'WATER_ENTRY',
      entityId: entry.id,
      action: 'UPSERT',
      data: {
        id: entry.id,
        amountMl: entry.amountMl,
        loggedAt: entry.loggedAt.toISOString(),
        day: entry.dailyLog.date.toISOString().slice(0, 10),
      },
    };
  }
}
