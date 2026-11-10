import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Glp1SymptomEvent } from '@prisma/client';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  optionalBoolean,
  optionalIsoDate,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredNumber,
  requiredString,
} from './payload-validation';
import { lockSyncUser } from './daily-log-sync';
import { glp1SymptomDraft, requireGlp1Scope, requireOwnedTreatment } from './glp1-sync-helpers';

interface ParsedSymptom {
  treatmentId: string;
  code: string;
  customName?: string;
  severity: number;
  occurredAt: Date;
  endedAt?: Date;
  durationMinutes?: number;
  notes?: string;
  relatedDoseEventIds: string[];
  acknowledged: boolean;
  safetyContentVersion?: string;
}

@Injectable()
export class Glp1SymptomCreateSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.GLP1_SYMPTOM_CREATE;

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    const parsed = this.parsePayload(mutation.payload, occurredAt);

    await lockSyncUser(tx, userId);
    await requireGlp1Scope(tx, userId, 'symptoms');
    await requireOwnedTreatment(tx, userId, parsed.treatmentId);

    const existingByMutation = await tx.glp1SymptomEvent.findUnique({
      where: { userId_clientMutationId: { userId, clientMutationId: mutation.mutationId } },
    });
    if (existingByMutation) {
      return this.resolveExisting(
        existingByMutation,
        parsed,
        userId,
        mutation.entityId,
        mutation.mutationId,
      );
    }

    const existingById = await tx.glp1SymptomEvent.findUnique({ where: { id: mutation.entityId } });
    if (existingById) {
      return this.resolveExisting(
        existingById,
        parsed,
        userId,
        mutation.entityId,
        mutation.mutationId,
      );
    }

    if (parsed.relatedDoseEventIds.length > 0) {
      const uniqueIds = [...new Set(parsed.relatedDoseEventIds)];
      const count = await tx.glp1DoseEvent.count({
        where: {
          id: { in: uniqueIds },
          userId,
          treatmentId: parsed.treatmentId,
          deletedAt: null,
        },
      });
      if (count !== uniqueIds.length) {
        throw new SyncOperationRejectedError(
          'RELATED_DOSE_EVENT_NOT_FOUND',
          'Um evento de dose relacionado nao foi encontrado.',
        );
      }
    }

    const symptom = await tx.glp1SymptomEvent.create({
      data: {
        id: mutation.entityId,
        userId,
        treatmentId: parsed.treatmentId,
        code: parsed.code,
        customName: parsed.customName,
        severity: parsed.severity,
        occurredAt: parsed.occurredAt,
        endedAt: parsed.endedAt,
        durationMinutes: parsed.durationMinutes,
        notes: parsed.notes,
        relatedDoseEventIdsJson:
          parsed.relatedDoseEventIds.length > 0
            ? (parsed.relatedDoseEventIds as Prisma.InputJsonArray)
            : undefined,
        acknowledgedAt: parsed.acknowledged ? new Date() : undefined,
        safetyContentVersion: parsed.safetyContentVersion,
        clientMutationId: mutation.mutationId,
      },
    });
    return glp1SymptomDraft(symptom);
  }

  private parsePayload(payload: Record<string, unknown>, occurredAt: Date): ParsedSymptom {
    assertExactPayload(payload, [
      'treatmentId',
      'code',
      'customName',
      'severity',
      'endedAt',
      'durationMinutes',
      'notes',
      'relatedDoseEventIds',
      'acknowledged',
      'safetyContentVersion',
    ]);
    const severity = requiredNumber(payload, 'severity', 0, 10, true);
    const acknowledged = optionalBoolean(payload, 'acknowledged') ?? false;
    const safetyContentVersion = optionalString(payload, 'safetyContentVersion', 32);
    if (severity >= 7 && (!acknowledged || !safetyContentVersion)) {
      throw new SyncOperationRejectedError(
        'SAFETY_ACKNOWLEDGEMENT_REQUIRED',
        'Sintomas de severidade alta exigem confirmacao do conteudo de seguranca.',
      );
    }
    const endedAt = optionalIsoDate(payload, 'endedAt');
    if (endedAt && endedAt.getTime() < occurredAt.getTime()) {
      throw new SyncOperationRejectedError(
        'INVALID_SYMPTOM_RANGE',
        'endedAt deve ser posterior a occurredAt.',
      );
    }
    return {
      treatmentId: requiredString(payload, 'treatmentId', 128),
      code: requiredString(payload, 'code', 80),
      customName: optionalString(payload, 'customName', 160, { allowEmpty: true }),
      severity,
      occurredAt,
      endedAt,
      durationMinutes: optionalNumber(payload, 'durationMinutes', 0, 525600, true),
      notes: optionalString(payload, 'notes', 4000, { allowEmpty: true }),
      relatedDoseEventIds: optionalStringArray(payload, 'relatedDoseEventIds', 50, 128) ?? [],
      acknowledged,
      safetyContentVersion,
    };
  }

  private resolveExisting(
    symptom: Glp1SymptomEvent,
    parsed: ParsedSymptom,
    userId: string,
    expectedEntityId: string,
    expectedMutationId: string,
  ): SyncChangeDraft {
    const storedRelatedDoseEventIds = Array.isArray(symptom.relatedDoseEventIdsJson)
      ? symptom.relatedDoseEventIdsJson
      : [];
    const same =
      symptom.id === expectedEntityId &&
      symptom.userId === userId &&
      symptom.deletedAt === null &&
      symptom.clientMutationId === expectedMutationId &&
      symptom.treatmentId === parsed.treatmentId &&
      symptom.code === parsed.code &&
      symptom.customName === (parsed.customName ?? null) &&
      symptom.severity === parsed.severity &&
      symptom.occurredAt.getTime() === parsed.occurredAt.getTime() &&
      (symptom.endedAt?.getTime() ?? null) === (parsed.endedAt?.getTime() ?? null) &&
      symptom.durationMinutes === (parsed.durationMinutes ?? null) &&
      symptom.notes === (parsed.notes ?? null) &&
      JSON.stringify(storedRelatedDoseEventIds) === JSON.stringify(parsed.relatedDoseEventIds) &&
      Boolean(symptom.acknowledgedAt) === parsed.acknowledged &&
      symptom.safetyContentVersion === (parsed.safetyContentVersion ?? null);
    if (!same) {
      throw new SyncOperationConflictError(
        'SYNC_ENTITY_ID_CONFLICT',
        'A mutationId ou o identificador do sintoma ja esta em uso com outro conteudo.',
      );
    }
    return glp1SymptomDraft(symptom);
  }
}
