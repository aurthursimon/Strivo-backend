import {
  BadRequestException,
  ConflictException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Prisma, SyncMutationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import type {
  GetSyncBootstrapQueryDto,
  GetSyncChangesQueryDto,
  PushSyncDto,
  SyncMutationDto,
} from './dto';
import {
  SYNC_BOOTSTRAP_SESSION_MINUTES,
  SYNC_CHANGE_RETENTION_DAYS,
  SYNC_MAX_PAYLOAD_BYTES,
  SYNC_RESULT_STATUSES,
  type SyncOperation,
} from './sync.constants';
import { hashSyncMutation, serializedSyncSize } from './sync-hash';
import { appendSyncChange, deleteSyncDraft } from './sync-journal';
import { SyncHandlerRegistry } from './sync-handler.registry';
import type { SyncItemResult } from './sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from './sync.types';
import { glp1DoseDraft, glp1SymptomDraft } from './handlers/glp1-sync-helpers';
import { workoutSessionDraft } from './handlers/workout-session-start.handler';
import { mealSyncDraft } from './handlers/meal-create.handler';
import { notificationPreferencesSyncDraft } from './handlers/notification-preferences-set.handler';

const BIGINT_MAX = 9223372036854775807n;

export interface LegacySyncCommand {
  operation: SyncOperation;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  dayOverride?: Date;
  mutationId?: string;
  entityId?: string;
}

interface BootstrapCursor {
  sessionId: string;
  offset: number;
}

export interface BootstrapItem {
  entityType:
    | 'WATER_ENTRY'
    | 'WEIGHT_ENTRY'
    | 'MEAL'
    | 'WORKOUT_SESSION'
    | 'GLP1_DOSE_EVENT'
    | 'GLP1_SYMPTOM_EVENT'
    | 'NOTIFICATION_PREFERENCES';
  entityId: string;
  action: 'UPSERT';
  version: number | null;
  occurredAt: string;
  data: Record<string, unknown>;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: SyncHandlerRegistry,
  ) {}

  async push(userId: string, dto: PushSyncDto) {
    if (serializedSyncSize(dto) > SYNC_MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'SYNC_PAYLOAD_TOO_LARGE',
        message: `O lote de sincronizacao deve ter no maximo ${SYNC_MAX_PAYLOAD_BYTES} bytes.`,
      });
    }

    const results: SyncItemResult[] = [];
    for (const mutation of dto.mutations) {
      results.push(await this.processMutation(userId, dto.installationId, mutation));
    }

    return {
      protocolVersion: 1,
      results,
      processedAt: new Date().toISOString(),
    };
  }

  async executeLegacyCommand(userId: string, command: LegacySyncCommand): Promise<SyncItemResult> {
    const suppliedMutationId = command.mutationId?.trim();
    const mutationId = suppliedMutationId || randomUUID();
    const entityId =
      command.entityId ??
      (suppliedMutationId
        ? this.deterministicUuid(`${userId}:${command.operation}:${mutationId}:entity`)
        : randomUUID());
    const mutation: SyncMutationDto = {
      mutationId,
      sequence: 1,
      type: command.operation,
      entityId,
      occurredAt: (command.occurredAt ?? new Date()).toISOString(),
      payload: command.payload,
    };
    const installationId = this.legacyInstallationId(userId, mutationId, command.operation);
    const requestHashOverride = suppliedMutationId
      ? hashSyncMutation({
          ...mutation,
          occurredAt: command.dayOverride?.toISOString() ?? '1970-01-01T00:00:00.000Z',
        })
      : undefined;
    const result = await this.processMutation(userId, installationId, mutation, {
      dayOverride: command.dayOverride,
      requestHashOverride,
    });

    if (
      result.status === SYNC_RESULT_STATUSES.APPLIED ||
      result.status === SYNC_RESULT_STATUSES.DUPLICATE
    ) {
      return result;
    }
    if (result.status === SYNC_RESULT_STATUSES.CONFLICT) {
      throw new ConflictException(result.error);
    }
    if (result.status === SYNC_RESULT_STATUSES.REJECTED) {
      throw new BadRequestException(result.error);
    }
    throw new ServiceUnavailableException({
      code: result.error?.code ?? 'SYNC_TEMPORARY_FAILURE',
      message: result.error?.message ?? 'A operacao nao pode ser confirmada agora.',
    });
  }

  async removeLegacyWater(userId: string, entryId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const entry = await tx.waterEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!entry) return false;

      await tx.waterEntry.delete({ where: { id: entry.id } });
      const remaining = await tx.waterEntry.aggregate({
        where: { dailyLogId: entry.dailyLogId },
        _sum: { amountMl: true },
      });
      await tx.dailyLog.update({
        where: { id: entry.dailyLogId },
        data: { totalWaterMl: remaining._sum.amountMl ?? 0 },
      });
      await appendSyncChange(tx, userId, deleteSyncDraft('WATER_ENTRY', entry.id));
      return true;
    });
  }

  async removeLegacyWeight(userId: string, entryId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const entry = await tx.weightEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!entry) return false;

      await tx.weightEntry.delete({ where: { id: entry.id } });

      // Both DailyLog.weightKg and User.weightKg denormalize "the latest
      // entry" (see WeightLogSyncHandler) - deleting the entry that was
      // winning either of those races must recompute the new winner, same as
      // the create path does, or they'd keep pointing at a deleted row's value.
      const [latestForDay, latestForUser] = await Promise.all([
        tx.weightEntry.findFirst({
          where: { userId, dailyLogId: entry.dailyLogId },
          orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        }),
        tx.weightEntry.findFirst({
          where: { userId },
          orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        }),
      ]);
      await Promise.all([
        tx.dailyLog.update({
          where: { id: entry.dailyLogId },
          data: { weightKg: latestForDay?.weightKg ?? null },
        }),
        tx.user.update({
          where: { id: userId },
          data: { weightKg: latestForUser?.weightKg ?? null },
        }),
      ]);

      await appendSyncChange(tx, userId, deleteSyncDraft('WEIGHT_ENTRY', entry.id));
      return true;
    });
  }

  async getBootstrap(userId: string, query: GetSyncBootstrapQueryDto) {
    const limit = query.limit ?? 100;
    const cursor = query.cursor ? this.decodeBootstrapCursor(query.cursor) : undefined;
    const session = cursor
      ? await this.loadBootstrapSession(userId, cursor.sessionId)
      : await this.createBootstrapSession(userId);
    const offset = cursor?.offset ?? 0;
    const items = this.asBootstrapItems(session.itemsJson);

    if (offset < 0 || offset > items.length) {
      throw new BadRequestException({
        code: 'SYNC_BOOTSTRAP_CURSOR_INVALID',
        message: 'O cursor de bootstrap aponta para uma posicao invalida.',
      });
    }

    const page = items.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const hasMore = nextOffset < items.length;
    return {
      protocolVersion: 1,
      snapshotRevision: session.snapshotRevision.toString(),
      cursor: hasMore ? null : session.snapshotRevision.toString(),
      nextPageCursor: hasMore
        ? this.encodeBootstrapCursor({ sessionId: session.id, offset: nextOffset })
        : null,
      hasMore,
      totalItems: session.totalItems,
      items: page,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async getChanges(userId: string, query: GetSyncChangesQueryDto) {
    const afterRevision = this.parseRevision(query.afterRevision);
    if (afterRevision === 0n) {
      throw this.bootstrapRequired('Cursor inicial requer um snapshot completo.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const state = await tx.syncState.findUnique({ where: { id: 1 } });
        if (!state) {
          throw new ServiceUnavailableException({
            code: 'SYNC_STATE_UNAVAILABLE',
            message: 'O relogio global de sincronizacao nao esta disponivel.',
          });
        }

        const currentWatermark = state.currentRevision;
        if (afterRevision > currentWatermark) {
          throw new BadRequestException({
            code: 'SYNC_CURSOR_INVALID',
            message: 'O cursor informado esta a frente da revisao atual do servidor.',
          });
        }
        if (afterRevision < state.retentionFloor) {
          throw this.bootstrapRequired('Cursor anterior a janela de retencao do journal.');
        }

        const limit = query.limit ?? 100;
        const rows = await tx.syncChange.findMany({
          where: {
            userId,
            revision: { gt: afterRevision, lte: currentWatermark },
          },
          orderBy: { revision: 'asc' },
          take: limit + 1,
        });
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const nextRevision = hasMore ? (page.at(-1)?.revision ?? afterRevision) : currentWatermark;

        return {
          protocolVersion: 1,
          afterRevision: afterRevision.toString(),
          nextRevision: nextRevision.toString(),
          hasMore,
          retentionDays: SYNC_CHANGE_RETENTION_DAYS,
          changes: page.map((change) => ({
            revision: change.revision.toString(),
            entityType: change.entityType,
            entityId: change.entityId,
            action: change.action,
            version: change.version,
            mutationId: change.mutationId,
            occurredAt: change.occurredAt.toISOString(),
            data: change.dataJson,
          })),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 5_000,
      },
    );
  }

  private async processMutation(
    userId: string,
    installationId: string,
    mutation: SyncMutationDto,
    options: { dayOverride?: Date; requestHashOverride?: string } = {},
  ): Promise<SyncItemResult> {
    const requestHash = options.requestHashOverride ?? hashSyncMutation(mutation);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.syncMutation.findUnique({
          where: { userId_mutationId: { userId, mutationId: mutation.mutationId } },
        });
        if (replay) return this.replayResult(mutation, requestHash, replay);

        const sequenceReplay = await tx.syncMutation.findUnique({
          where: {
            userId_installationId_sequence: {
              userId,
              installationId,
              sequence: mutation.sequence,
            },
          },
        });
        if (sequenceReplay) return this.sequenceConflictResult(mutation, sequenceReplay.mutationId);

        const handler = this.handlers.resolve(mutation.type);
        if (!handler) {
          return this.persistRejected(tx, userId, installationId, mutation, requestHash, {
            code: 'SYNC_OPERATION_NOT_ENABLED',
            message: `A operacao ${mutation.type} nao esta habilitada neste protocolo.`,
          });
        }

        const dependencyResult = await this.checkDependencies(tx, userId, mutation);
        if (dependencyResult) {
          if (dependencyResult.status === SYNC_RESULT_STATUSES.REJECTED && dependencyResult.error) {
            return this.persistRejected(tx, userId, installationId, mutation, requestHash, {
              code: dependencyResult.error.code,
              message: dependencyResult.error.message,
            });
          }
          return dependencyResult;
        }

        await tx.syncMutation.create({
          data: {
            userId,
            mutationId: mutation.mutationId,
            installationId,
            sequence: mutation.sequence,
            operation: mutation.type,
            entityId: mutation.entityId,
            requestHash,
            occurredAt: new Date(mutation.occurredAt),
          },
        });

        let draft;
        try {
          draft = await handler.execute(tx, {
            userId,
            installationId,
            mutation,
            occurredAt: new Date(mutation.occurredAt),
            dayOverride: options.dayOverride,
          });
        } catch (error) {
          if (error instanceof SyncOperationConflictError) {
            const conflict = this.conflictResult(mutation, error.code, error.message);
            await tx.syncMutation.update({
              where: { userId_mutationId: { userId, mutationId: mutation.mutationId } },
              data: {
                status: SyncMutationStatus.REJECTED,
                errorCode: error.code,
                resultJson: conflict as unknown as Prisma.InputJsonObject,
                processedAt: new Date(),
              },
            });
            return conflict;
          }
          if (error instanceof SyncOperationRejectedError) {
            const rejected = this.rejectedResult(mutation, error.code, error.message);
            await tx.syncMutation.update({
              where: { userId_mutationId: { userId, mutationId: mutation.mutationId } },
              data: {
                status: SyncMutationStatus.REJECTED,
                errorCode: error.code,
                resultJson: rejected as unknown as Prisma.InputJsonObject,
                processedAt: new Date(),
              },
            });
            return rejected;
          }
          throw error;
        }

        const change = await appendSyncChange(tx, userId, draft, {
          mutationId: mutation.mutationId,
          occurredAt: new Date(mutation.occurredAt),
        });
        const result: SyncItemResult = {
          mutationId: mutation.mutationId,
          status: SYNC_RESULT_STATUSES.APPLIED,
          entityId: draft.entityId,
          revision: change.revision.toString(),
          result: {
            entityType: draft.entityType,
            entityId: draft.entityId,
            data: draft.data,
          },
        };
        await tx.syncMutation.update({
          where: { userId_mutationId: { userId, mutationId: mutation.mutationId } },
          data: {
            status: SyncMutationStatus.APPLIED,
            resultJson: result as unknown as Prisma.InputJsonObject,
            processedAt: new Date(),
          },
        });
        return result;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const replay = await this.prisma.syncMutation.findUnique({
          where: { userId_mutationId: { userId, mutationId: mutation.mutationId } },
        });
        if (replay) return this.replayResult(mutation, requestHash, replay);

        const sequenceReplay = await this.prisma.syncMutation.findUnique({
          where: {
            userId_installationId_sequence: {
              userId,
              installationId,
              sequence: mutation.sequence,
            },
          },
        });
        if (sequenceReplay) return this.sequenceConflictResult(mutation, sequenceReplay.mutationId);
      }

      return {
        mutationId: mutation.mutationId,
        status: SYNC_RESULT_STATUSES.RETRY,
        entityId: mutation.entityId,
        error: {
          code: 'SYNC_TEMPORARY_FAILURE',
          message: 'A operacao nao foi confirmada. Tente novamente com a mesma mutationId.',
          retryable: true,
        },
      };
    }
  }

  private async checkDependencies(
    tx: Prisma.TransactionClient,
    userId: string,
    mutation: SyncMutationDto,
  ): Promise<SyncItemResult | undefined> {
    const dependencies = mutation.dependsOn ?? [];
    if (dependencies.length === 0) return undefined;

    const records = await tx.syncMutation.findMany({
      where: { userId, mutationId: { in: dependencies } },
      select: { mutationId: true, status: true },
    });
    const rejected = records.find((record) => record.status === SyncMutationStatus.REJECTED);
    if (rejected) {
      return this.rejectedResult(
        mutation,
        'SYNC_DEPENDENCY_REJECTED',
        `A dependencia ${rejected.mutationId} foi rejeitada.`,
      );
    }

    const applied = new Set(
      records
        .filter((record) => record.status === SyncMutationStatus.APPLIED)
        .map((record) => record.mutationId),
    );
    const missing = dependencies.filter((mutationId) => !applied.has(mutationId));
    if (missing.length === 0) return undefined;

    return {
      mutationId: mutation.mutationId,
      status: SYNC_RESULT_STATUSES.DEPENDENCY_PENDING,
      entityId: mutation.entityId,
      error: {
        code: 'SYNC_DEPENDENCY_PENDING',
        message: `Dependencias ainda nao aplicadas: ${missing.join(', ')}.`,
        retryable: true,
      },
    };
  }

  private async persistRejected(
    tx: Prisma.TransactionClient,
    userId: string,
    installationId: string,
    mutation: SyncMutationDto,
    requestHash: string,
    error: { code: string; message: string },
  ): Promise<SyncItemResult> {
    const result = this.rejectedResult(mutation, error.code, error.message);
    await tx.syncMutation.create({
      data: {
        userId,
        mutationId: mutation.mutationId,
        installationId,
        sequence: mutation.sequence,
        operation: mutation.type,
        entityId: mutation.entityId,
        requestHash,
        status: SyncMutationStatus.REJECTED,
        resultJson: result as unknown as Prisma.InputJsonObject,
        errorCode: error.code,
        occurredAt: new Date(mutation.occurredAt),
        processedAt: new Date(),
      },
    });
    return result;
  }

  private replayResult(
    mutation: SyncMutationDto,
    requestHash: string,
    replay: {
      requestHash: string;
      status: SyncMutationStatus;
      resultJson: Prisma.JsonValue | null;
    },
  ): SyncItemResult {
    if (replay.requestHash !== requestHash) {
      return {
        mutationId: mutation.mutationId,
        status: SYNC_RESULT_STATUSES.CONFLICT,
        entityId: mutation.entityId,
        error: {
          code: 'SYNC_MUTATION_ID_REUSED',
          message: 'A mutationId ja foi usada com outro conteudo.',
          retryable: false,
        },
      };
    }

    const stored = this.asStoredResult(replay.resultJson);
    if (replay.status === SyncMutationStatus.APPLIED) {
      return {
        ...stored,
        mutationId: mutation.mutationId,
        entityId: stored.entityId ?? mutation.entityId,
        status: SYNC_RESULT_STATUSES.DUPLICATE,
      };
    }
    if (replay.status === SyncMutationStatus.REJECTED) {
      if (stored.status === SYNC_RESULT_STATUSES.CONFLICT) {
        return {
          ...stored,
          mutationId: mutation.mutationId,
          entityId: stored.entityId ?? mutation.entityId,
          status: SYNC_RESULT_STATUSES.CONFLICT,
        } as SyncItemResult;
      }
      return {
        ...this.rejectedResult(
          mutation,
          'SYNC_MUTATION_REJECTED',
          'A operacao foi rejeitada anteriormente.',
        ),
        ...stored,
        mutationId: mutation.mutationId,
        entityId: stored.entityId ?? mutation.entityId,
        status: SYNC_RESULT_STATUSES.REJECTED,
      };
    }

    return {
      mutationId: mutation.mutationId,
      status: SYNC_RESULT_STATUSES.RETRY,
      entityId: mutation.entityId,
      error: {
        code: 'SYNC_MUTATION_PROCESSING',
        message: 'A operacao ainda esta em processamento.',
        retryable: true,
      },
    };
  }

  private asStoredResult(value: Prisma.JsonValue | null): Partial<SyncItemResult> {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value as unknown as Partial<SyncItemResult>;
  }

  private rejectedResult(mutation: SyncMutationDto, code: string, message: string): SyncItemResult {
    return {
      mutationId: mutation.mutationId,
      status: SYNC_RESULT_STATUSES.REJECTED,
      entityId: mutation.entityId,
      error: { code, message, retryable: false },
    };
  }

  private conflictResult(mutation: SyncMutationDto, code: string, message: string): SyncItemResult {
    return {
      mutationId: mutation.mutationId,
      status: SYNC_RESULT_STATUSES.CONFLICT,
      entityId: mutation.entityId,
      error: { code, message, retryable: false },
    };
  }

  private sequenceConflictResult(
    mutation: SyncMutationDto,
    existingMutationId: string,
  ): SyncItemResult {
    return {
      mutationId: mutation.mutationId,
      status: SYNC_RESULT_STATUSES.CONFLICT,
      entityId: mutation.entityId,
      error: {
        code: 'SYNC_SEQUENCE_REUSED',
        message: `A sequencia desta instalacao ja pertence a mutationId ${existingMutationId}.`,
        retryable: false,
      },
    };
  }

  private async createBootstrapSession(userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
        const state = await tx.syncState.findUnique({ where: { id: 1 } });
        if (!state) {
          throw new ServiceUnavailableException({
            code: 'SYNC_STATE_UNAVAILABLE',
            message: 'O relogio global de sincronizacao nao esta disponivel.',
          });
        }
        const [
          waterEntries,
          weightEntries,
          meals,
          workoutSessions,
          doseEvents,
          symptomEvents,
          notificationPreferences,
        ] = await Promise.all([
          tx.waterEntry.findMany({
            where: { userId },
            include: { dailyLog: { select: { date: true } } },
            orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }],
          }),
          tx.weightEntry.findMany({
            where: { userId },
            include: { dailyLog: { select: { date: true } } },
            orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
          }),
          tx.meal.findMany({
            where: { userId },
            include: {
              items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
              dailyLog: { select: { date: true } },
            },
            orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }],
          }),
          tx.workoutSession.findMany({
            where: { userId },
            orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
          }),
          tx.glp1DoseEvent.findMany({
            where: { userId, deletedAt: null },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
          tx.glp1SymptomEvent.findMany({
            where: { userId, deletedAt: null },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          }),
          tx.notificationPreference.findUnique({ where: { userId } }),
        ]);
        const items: BootstrapItem[] = [
          ...waterEntries.map((entry) => ({
            entityType: 'WATER_ENTRY' as const,
            entityId: entry.id,
            action: 'UPSERT' as const,
            version: null,
            occurredAt: entry.loggedAt.toISOString(),
            data: {
              id: entry.id,
              amountMl: entry.amountMl,
              loggedAt: entry.loggedAt.toISOString(),
              day: entry.dailyLog.date.toISOString().slice(0, 10),
            },
          })),
          ...weightEntries.map((entry) => ({
            entityType: 'WEIGHT_ENTRY' as const,
            entityId: entry.id,
            action: 'UPSERT' as const,
            version: null,
            occurredAt: entry.measuredAt.toISOString(),
            data: {
              id: entry.id,
              weightKg: entry.weightKg,
              measuredAt: entry.measuredAt.toISOString(),
              day: entry.dailyLog.date.toISOString().slice(0, 10),
            },
          })),
          ...meals.map((meal) => {
            const draft = mealSyncDraft(meal);
            return {
              entityType: 'MEAL' as const,
              entityId: meal.id,
              action: 'UPSERT' as const,
              version: null,
              occurredAt: meal.loggedAt.toISOString(),
              data: draft.data ?? {},
            };
          }),
          ...workoutSessions.map((session) => {
            const draft = workoutSessionDraft(session);
            return {
              entityType: 'WORKOUT_SESSION' as const,
              entityId: session.id,
              action: 'UPSERT' as const,
              version: null,
              occurredAt: (session.finishedAt ?? session.startedAt).toISOString(),
              data: draft.data ?? {},
            };
          }),
          ...doseEvents.map((event) => {
            const draft = glp1DoseDraft(event);
            return {
              entityType: 'GLP1_DOSE_EVENT' as const,
              entityId: event.id,
              action: 'UPSERT' as const,
              version: event.version,
              occurredAt: (event.takenAt ?? event.scheduledAt ?? event.createdAt).toISOString(),
              data: draft.data ?? {},
            };
          }),
          ...symptomEvents.map((event) => {
            const draft = glp1SymptomDraft(event);
            return {
              entityType: 'GLP1_SYMPTOM_EVENT' as const,
              entityId: event.id,
              action: 'UPSERT' as const,
              version: event.version,
              occurredAt: event.occurredAt.toISOString(),
              data: draft.data ?? {},
            };
          }),
          ...(notificationPreferences
            ? [
                (() => {
                  const draft = notificationPreferencesSyncDraft(notificationPreferences);
                  return {
                    entityType: 'NOTIFICATION_PREFERENCES' as const,
                    entityId: notificationPreferences.id,
                    action: 'UPSERT' as const,
                    version: notificationPreferences.syncSequence,
                    occurredAt: (
                      notificationPreferences.syncOccurredAt ?? notificationPreferences.updatedAt
                    ).toISOString(),
                    data: draft.data ?? {},
                  };
                })(),
              ]
            : []),
        ].sort((left, right) => {
          const byTime = left.occurredAt.localeCompare(right.occurredAt);
          if (byTime !== 0) return byTime;
          const byType = left.entityType.localeCompare(right.entityType);
          return byType !== 0 ? byType : left.entityId.localeCompare(right.entityId);
        });

        const now = new Date();
        const expiresAt = new Date(now.getTime() + SYNC_BOOTSTRAP_SESSION_MINUTES * 60 * 1000);
        await tx.syncBootstrapSession.deleteMany({
          where: { expiresAt: { lt: now } },
        });
        return tx.syncBootstrapSession.create({
          data: {
            id: randomUUID(),
            userId,
            snapshotRevision: state.currentRevision,
            itemsJson: items as unknown as Prisma.InputJsonArray,
            totalItems: items.length,
            expiresAt,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );
  }

  private async loadBootstrapSession(userId: string, sessionId: string) {
    const session = await this.prisma.syncBootstrapSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw this.bootstrapRequired('A sessao de bootstrap expirou ou nao pertence ao usuario.');
    }
    return session;
  }

  private asBootstrapItems(value: Prisma.JsonValue): BootstrapItem[] {
    if (!Array.isArray(value)) {
      throw new ServiceUnavailableException({
        code: 'SYNC_BOOTSTRAP_CORRUPT',
        message: 'O snapshot de bootstrap armazenado e invalido.',
      });
    }
    return value as unknown as BootstrapItem[];
  }

  private encodeBootstrapCursor(cursor: BootstrapCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeBootstrapCursor(raw: string): BootstrapCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as Partial<BootstrapCursor>;
      if (
        typeof parsed.sessionId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parsed.sessionId,
        ) ||
        !Number.isInteger(parsed.offset) ||
        (parsed.offset ?? -1) < 0
      ) {
        throw new Error('invalid cursor');
      }
      return { sessionId: parsed.sessionId, offset: parsed.offset as number };
    } catch {
      throw new BadRequestException({
        code: 'SYNC_BOOTSTRAP_CURSOR_INVALID',
        message: 'O cursor de bootstrap e invalido.',
      });
    }
  }

  private legacyInstallationId(userId: string, mutationId: string, operation: string): string {
    return this.deterministicUuid(`${userId}:${operation}:${mutationId}:installation`);
  }

  private deterministicUuid(value: string): string {
    const hex = createHash('sha256').update(value).digest('hex');
    const variant = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  private parseRevision(raw: string): bigint {
    const revision = BigInt(raw);
    if (revision > BIGINT_MAX) {
      throw new BadRequestException({
        code: 'SYNC_CURSOR_INVALID',
        message: 'O cursor informado excede o intervalo aceito.',
      });
    }
    return revision;
  }

  private bootstrapRequired(reason: string): ConflictException {
    return new ConflictException({
      code: 'BOOTSTRAP_REQUIRED',
      message: 'Um snapshot completo deve ser baixado antes de continuar a sincronizacao.',
      reason,
      retentionDays: SYNC_CHANGE_RETENTION_DAYS,
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
