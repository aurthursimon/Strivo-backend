import { Injectable } from '@nestjs/common';
import type { Prisma, WorkoutSession } from '@prisma/client';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  requiredString,
} from './payload-validation';
import { lockSyncUser } from './daily-log-sync';

export function workoutSessionDraft(session: WorkoutSession): SyncChangeDraft {
  return {
    entityType: 'WORKOUT_SESSION',
    entityId: session.id,
    action: 'UPSERT',
    data: {
      id: session.id,
      planId: session.planId,
      workoutId: session.workoutId,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() ?? null,
      durationMin: session.durationMin,
      completedExercises: Array.isArray(session.completedExercisesJson)
        ? session.completedExercisesJson
        : [],
    },
  };
}

@Injectable()
export class WorkoutSessionStartSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.WORKOUT_SESSION_START;

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    assertExactPayload(mutation.payload, ['planId', 'workoutId']);
    const planId = requiredString(mutation.payload, 'planId', 128);
    const workoutId = requiredString(mutation.payload, 'workoutId', 128);

    await lockSyncUser(tx, userId);
    const plan = await tx.workoutPlan.findFirst({
      where: { id: planId, userId },
      select: { id: true },
    });
    if (!plan) {
      throw new SyncOperationRejectedError(
        'SYNC_WORKOUT_PLAN_NOT_FOUND',
        'O plano de treino nao existe ou nao pertence ao usuario.',
      );
    }

    const existing = await tx.workoutSession.findUnique({ where: { id: mutation.entityId } });
    if (existing) {
      const same =
        existing.userId === userId &&
        existing.planId === planId &&
        existing.workoutId === workoutId &&
        existing.startedAt.getTime() === occurredAt.getTime();
      if (!same) {
        throw new SyncOperationConflictError(
          'SYNC_ENTITY_ID_CONFLICT',
          'O identificador da sessao de treino ja esta em uso.',
        );
      }
      return workoutSessionDraft(existing);
    }

    const session = await tx.workoutSession.create({
      data: {
        id: mutation.entityId,
        userId,
        planId,
        workoutId,
        startedAt: occurredAt,
        completedExercisesJson: [],
      },
    });
    return workoutSessionDraft(session);
  }
}
