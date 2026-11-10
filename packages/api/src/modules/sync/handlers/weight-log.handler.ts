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
import { applyWeightLoggedEffects } from '../business-effects';

@Injectable()
export class WeightLogSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.WEIGHT_LOG;

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    assertExactPayload(mutation.payload, ['weightKg']);
    const weightKg = requiredNumber(mutation.payload, 'weightKg', 20, 500);

    await lockSyncUser(tx, userId);

    const existing = await tx.weightEntry.findUnique({ where: { id: mutation.entityId } });
    if (existing) {
      throw new SyncOperationRejectedError(
        'SYNC_ENTITY_ID_CONFLICT',
        'O identificador do registro de peso ja esta em uso.',
      );
    }

    const { dailyLog, date } = await getOrCreateDailyLog(
      tx,
      userId,
      occurredAt,
      context.dayOverride,
    );
    const entry = await tx.weightEntry.create({
      data: {
        id: mutation.entityId,
        userId,
        dailyLogId: dailyLog.id,
        weightKg,
        clientMutationId: mutation.mutationId,
        measuredAt: occurredAt,
      },
    });

    const [latestForDay, latestForUser] = await Promise.all([
      tx.weightEntry.findFirst({
        where: { userId, dailyLogId: dailyLog.id },
        orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
      tx.weightEntry.findFirst({
        where: { userId },
        orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    await Promise.all([
      tx.dailyLog.update({
        where: { id: dailyLog.id },
        data: { weightKg: latestForDay?.weightKg ?? weightKg },
      }),
      tx.user.update({
        where: { id: userId },
        data: { weightKg: latestForUser?.weightKg ?? weightKg },
      }),
    ]);
    await applyWeightLoggedEffects(tx, userId);

    return {
      entityType: 'WEIGHT_ENTRY',
      entityId: entry.id,
      action: 'UPSERT',
      data: {
        id: entry.id,
        weightKg: entry.weightKg,
        measuredAt: entry.measuredAt.toISOString(),
        day: date.toISOString().slice(0, 10),
      },
    };
  }
}
