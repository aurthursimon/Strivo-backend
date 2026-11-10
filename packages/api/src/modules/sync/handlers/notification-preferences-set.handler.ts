import { Injectable } from '@nestjs/common';
import type { NotificationPreference, Prisma } from '@prisma/client';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  requiredBoolean,
  requiredNumber,
  requiredString,
} from './payload-validation';

export function notificationPreferencesSyncDraft(pref: NotificationPreference): SyncChangeDraft {
  return {
    entityType: 'NOTIFICATION_PREFERENCES',
    entityId: pref.id,
    action: 'UPSERT',
    version: pref.syncSequence ?? undefined,
    data: {
      id: pref.id,
      pushEnabled: pref.pushEnabled,
      breakfast: pref.breakfast ? pref.breakfastTime : null,
      lunch: pref.lunch ? pref.lunchTime : null,
      afternoonSnack: pref.afternoonSnack ? pref.afternoonSnackTime : null,
      dinner: pref.dinner ? pref.dinnerTime : null,
      water: pref.water,
      waterIntervalH: pref.waterIntervalH,
      waterStartTime: pref.waterStartTime,
      waterEndTime: pref.waterEndTime,
      workout: pref.workout,
      workoutTime: pref.workoutTime,
      workoutDays: Array.isArray(pref.workoutDaysJson) ? pref.workoutDaysJson : [],
      progressCheck: pref.progressCheck,
      progressCheckTime: pref.progressCheckTime,
      progressCheckWeekday: pref.progressCheckWeekday,
      streakRisk: pref.streakRisk,
      streakRiskTime: pref.streakRiskTime,
      logicalOccurredAt: pref.syncOccurredAt?.toISOString() ?? pref.updatedAt.toISOString(),
    },
  };
}
import { lockSyncUser } from './daily-log-sync';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = [
  'pushEnabled',
  'breakfast',
  'lunch',
  'afternoonSnack',
  'dinner',
  'water',
  'waterIntervalH',
  'waterStartTime',
  'waterEndTime',
  'workout',
  'workoutTime',
  'workoutDays',
  'progressCheck',
  'progressCheckTime',
  'progressCheckWeekday',
  'streakRisk',
  'streakRiskTime',
] as const;

interface DesiredPreferences {
  pushEnabled: boolean;
  breakfast: string | null;
  lunch: string | null;
  afternoonSnack: string | null;
  dinner: string | null;
  water: boolean;
  waterIntervalH: number;
  waterStartTime: string;
  waterEndTime: string;
  workout: boolean;
  workoutTime: string;
  workoutDays: number[];
  progressCheck: boolean;
  progressCheckTime: string;
  progressCheckWeekday: number;
  streakRisk: boolean;
  streakRiskTime: string;
}

@Injectable()
export class NotificationPreferencesSetSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.NOTIFICATION_PREFERENCES_SET;

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { installationId, mutation, occurredAt, userId } = context;
    if (!installationId) throw new Error('installationId missing from sync context');
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    const desired = this.parsePayload(mutation.payload);

    await lockSyncUser(tx, userId);
    const existing = await tx.notificationPreference.findUnique({ where: { userId } });
    if (existing) {
      this.assertNewer(
        existing,
        installationId,
        mutation.sequence,
        mutation.mutationId,
        occurredAt,
      );
    } else {
      const occupiedId = await tx.notificationPreference.findUnique({
        where: { id: mutation.entityId },
        select: { userId: true },
      });
      if (occupiedId) {
        throw new SyncOperationConflictError(
          'SYNC_ENTITY_ID_CONFLICT',
          'O identificador das preferencias ja esta em uso.',
        );
      }
    }

    const data = {
      pushEnabled: desired.pushEnabled,
      breakfast: desired.breakfast !== null,
      ...(desired.breakfast !== null ? { breakfastTime: desired.breakfast } : {}),
      lunch: desired.lunch !== null,
      ...(desired.lunch !== null ? { lunchTime: desired.lunch } : {}),
      afternoonSnack: desired.afternoonSnack !== null,
      ...(desired.afternoonSnack !== null ? { afternoonSnackTime: desired.afternoonSnack } : {}),
      dinner: desired.dinner !== null,
      ...(desired.dinner !== null ? { dinnerTime: desired.dinner } : {}),
      water: desired.water,
      waterIntervalH: desired.waterIntervalH,
      waterStartTime: desired.waterStartTime,
      waterEndTime: desired.waterEndTime,
      workout: desired.workout,
      workoutTime: desired.workoutTime,
      workoutDaysJson: desired.workoutDays,
      progressCheck: desired.progressCheck,
      progressCheckTime: desired.progressCheckTime,
      progressCheckWeekday: desired.progressCheckWeekday,
      streakRisk: desired.streakRisk,
      streakRiskTime: desired.streakRiskTime,
      syncOccurredAt: occurredAt,
      syncMutationId: mutation.mutationId,
      syncInstallationId: installationId,
      syncSequence: mutation.sequence,
    };
    const pref = await tx.notificationPreference.upsert({
      where: { userId },
      create: { id: mutation.entityId, userId, ...data },
      update: data,
    });
    await tx.user.update({
      where: { id: userId },
      data: { notificationsOptIn: desired.pushEnabled },
    });
    return notificationPreferencesSyncDraft(pref);
  }

  private parsePayload(payload: Record<string, unknown>): DesiredPreferences {
    assertExactPayload(payload, FIELDS);
    const missing = FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(payload, field));
    if (missing.length > 0) {
      throw new SyncOperationRejectedError(
        'SYNC_DESIRED_STATE_INCOMPLETE',
        `O estado completo das preferencias e obrigatorio. Campos ausentes: ${missing.join(', ')}.`,
      );
    }
    const rawWorkoutDays = payload.workoutDays;
    if (
      !Array.isArray(rawWorkoutDays) ||
      rawWorkoutDays.length < 1 ||
      rawWorkoutDays.length > 7 ||
      rawWorkoutDays.some(
        (day) => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6,
      ) ||
      new Set(rawWorkoutDays).size !== rawWorkoutDays.length
    ) {
      throw new SyncOperationRejectedError(
        'SYNC_PAYLOAD_INVALID',
        'workoutDays deve conter dias unicos entre 0 e 6.',
      );
    }
    const workoutDays = rawWorkoutDays as number[];
    return {
      pushEnabled: requiredBoolean(payload, 'pushEnabled'),
      breakfast: this.nullableTime(payload, 'breakfast'),
      lunch: this.nullableTime(payload, 'lunch'),
      afternoonSnack: this.nullableTime(payload, 'afternoonSnack'),
      dinner: this.nullableTime(payload, 'dinner'),
      water: requiredBoolean(payload, 'water'),
      waterIntervalH: requiredNumber(payload, 'waterIntervalH', 1, 8, true),
      waterStartTime: requiredString(payload, 'waterStartTime', 5, { pattern: TIME_PATTERN }),
      waterEndTime: requiredString(payload, 'waterEndTime', 5, { pattern: TIME_PATTERN }),
      workout: requiredBoolean(payload, 'workout'),
      workoutTime: requiredString(payload, 'workoutTime', 5, { pattern: TIME_PATTERN }),
      workoutDays,
      progressCheck: requiredBoolean(payload, 'progressCheck'),
      progressCheckTime: requiredString(payload, 'progressCheckTime', 5, {
        pattern: TIME_PATTERN,
      }),
      progressCheckWeekday: requiredNumber(payload, 'progressCheckWeekday', 0, 6, true),
      streakRisk: requiredBoolean(payload, 'streakRisk'),
      streakRiskTime: requiredString(payload, 'streakRiskTime', 5, { pattern: TIME_PATTERN }),
    };
  }

  private nullableTime(payload: Record<string, unknown>, field: string): string | null {
    if (payload[field] === null) return null;
    return requiredString(payload, field, 5, { pattern: TIME_PATTERN });
  }

  private assertNewer(
    pref: NotificationPreference,
    installationId: string,
    sequence: number,
    mutationId: string,
    occurredAt: Date,
  ): void {
    if (!pref.syncOccurredAt || !pref.syncMutationId || !pref.syncInstallationId) {
      if (occurredAt.getTime() < pref.updatedAt.getTime()) {
        throw new SyncOperationConflictError(
          'SYNC_DESIRED_STATE_STALE',
          'As preferencias foram alteradas depois deste estado offline.',
        );
      }
      return;
    }

    if (pref.syncInstallationId === installationId) {
      if (sequence <= (pref.syncSequence ?? 0)) {
        throw new SyncOperationConflictError(
          'SYNC_DESIRED_STATE_STALE',
          'Uma versao mais nova destas preferencias ja foi aplicada nesta instalacao.',
        );
      }
      return;
    }

    const timeDelta = occurredAt.getTime() - pref.syncOccurredAt.getTime();
    if (timeDelta < 0 || (timeDelta === 0 && mutationId.localeCompare(pref.syncMutationId) <= 0)) {
      throw new SyncOperationConflictError(
        'SYNC_DESIRED_STATE_STALE',
        'Uma versao mais nova destas preferencias ja foi aplicada em outro dispositivo.',
      );
    }
  }
}
