import { Injectable } from '@nestjs/common';
import { Prisma, SyncMutationStatus } from '@prisma/client';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  optionalNumber,
  requiredStringArray,
} from './payload-validation';
import { lockSyncUser } from './daily-log-sync';
import { workoutSessionDraft } from './workout-session-start.handler';

@Injectable()
export class WorkoutSessionFinishSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.WORKOUT_SESSION_FINISH;

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    assertExactPayload(mutation.payload, ['completedExercises', 'durationMin']);
    const completedExercises = requiredStringArray(
      mutation.payload,
      'completedExercises',
      200,
      128,
    );
    const durationMin = optionalNumber(mutation.payload, 'durationMin', 0, 1440, true);

    if (!mutation.dependsOn?.length) {
      throw new SyncOperationRejectedError(
        'SYNC_WORKOUT_START_DEPENDENCY_REQUIRED',
        'A finalizacao deve depender da mutacao que iniciou a mesma sessao.',
      );
    }

    await lockSyncUser(tx, userId);
    const startDependency = await tx.syncMutation.findFirst({
      where: {
        userId,
        mutationId: { in: mutation.dependsOn },
        operation: SYNC_OPERATIONS.WORKOUT_SESSION_START,
        entityId: mutation.entityId,
        status: SyncMutationStatus.APPLIED,
      },
      select: { mutationId: true },
    });
    if (!startDependency) {
      throw new SyncOperationRejectedError(
        'SYNC_WORKOUT_START_DEPENDENCY_INVALID',
        'A dependencia informada nao iniciou esta sessao de treino.',
      );
    }

    const existing = await tx.workoutSession.findUnique({ where: { id: mutation.entityId } });
    if (!existing || existing.userId !== userId) {
      throw new SyncOperationRejectedError(
        'SYNC_WORKOUT_SESSION_NOT_FOUND',
        'A sessao de treino nao existe ou nao pertence ao usuario.',
      );
    }
    if (occurredAt.getTime() < existing.startedAt.getTime()) {
      throw new SyncOperationRejectedError(
        'SYNC_WORKOUT_FINISH_BEFORE_START',
        'A sessao nao pode terminar antes de iniciar.',
      );
    }

    if (existing.finishedAt) {
      const existingExercises = Array.isArray(existing.completedExercisesJson)
        ? existing.completedExercisesJson
        : [];
      const same =
        existing.finishedAt.getTime() === occurredAt.getTime() &&
        existing.durationMin === (durationMin ?? null) &&
        JSON.stringify(existingExercises) === JSON.stringify(completedExercises);
      if (!same) {
        throw new SyncOperationConflictError(
          'SYNC_WORKOUT_SESSION_ALREADY_FINISHED',
          'A sessao ja foi finalizada com outro conteudo.',
        );
      }
      return workoutSessionDraft(existing);
    }

    const updated = await tx.workoutSession.updateMany({
      where: { id: mutation.entityId, userId, finishedAt: null },
      data: {
        finishedAt: occurredAt,
        durationMin,
        completedExercisesJson: completedExercises as Prisma.InputJsonArray,
      },
    });
    if (updated.count !== 1) {
      throw new SyncOperationConflictError(
        'SYNC_WORKOUT_SESSION_ALREADY_FINISHED',
        'A sessao foi finalizada por outra operacao.',
      );
    }
    const session = await tx.workoutSession.findUnique({ where: { id: mutation.entityId } });
    if (!session) {
      throw new Error('workout session disappeared after update');
    }
    return workoutSessionDraft(session);
  }
}
