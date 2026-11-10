import type { Glp1DoseEvent, Glp1SymptomEvent, Prisma } from '@prisma/client';
import type { SyncChangeDraft } from '../sync.types';
import { SyncOperationRejectedError } from '../sync.types';

export async function requireGlp1Scope(
  tx: Prisma.TransactionClient,
  userId: string,
  scope: 'dose' | 'symptoms',
): Promise<void> {
  const consent = await tx.glp1Consent.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { acceptedAt: 'desc' },
  });
  if (!consent) {
    throw new SyncOperationRejectedError(
      'GLP1_CONSENT_REQUIRED',
      'Consentimento GLP-1 necessario antes de salvar dados.',
    );
  }
  const scopes = Array.isArray(consent.scopesJson)
    ? consent.scopesJson.filter((value): value is string => typeof value === 'string')
    : [];
  if (!scopes.includes(scope)) {
    throw new SyncOperationRejectedError(
      'GLP1_SCOPE_REQUIRED',
      `O consentimento atual nao inclui o escopo ${scope}.`,
    );
  }
}

export async function requireOwnedTreatment(
  tx: Prisma.TransactionClient,
  userId: string,
  treatmentId: string,
): Promise<void> {
  const treatment = await tx.glp1Treatment.findFirst({
    where: { id: treatmentId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!treatment) {
    throw new SyncOperationRejectedError(
      'GLP1_TREATMENT_NOT_FOUND',
      'Tratamento GLP-1 nao encontrado.',
    );
  }
}

function decimal(value: { toNumber(): number } | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

export function glp1DoseDraft(event: Glp1DoseEvent): SyncChangeDraft {
  return {
    entityType: 'GLP1_DOSE_EVENT',
    entityId: event.id,
    action: 'UPSERT',
    version: event.version,
    data: {
      id: event.id,
      treatmentId: event.treatmentId,
      scheduledAt: event.scheduledAt?.toISOString() ?? null,
      reminderAt: event.reminderAt?.toISOString() ?? null,
      takenAt: event.takenAt?.toISOString() ?? null,
      doseMg: decimal(event.doseMg),
      status: event.status.toLowerCase(),
      route: event.route.toLowerCase(),
      injectionSiteCode: event.injectionSiteCode,
      painLevel: event.painLevel,
      notes: event.notes,
      source: event.source.toLowerCase(),
      possibleDuplicateOfId: event.possibleDuplicateOfId,
      duplicateConfirmedAt: event.duplicateConfirmedAt?.toISOString() ?? null,
      version: event.version,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    },
  };
}

export function glp1SymptomDraft(event: Glp1SymptomEvent): SyncChangeDraft {
  return {
    entityType: 'GLP1_SYMPTOM_EVENT',
    entityId: event.id,
    action: 'UPSERT',
    version: event.version,
    data: {
      id: event.id,
      treatmentId: event.treatmentId,
      code: event.code,
      customName: event.customName,
      severity: event.severity,
      occurredAt: event.occurredAt.toISOString(),
      endedAt: event.endedAt?.toISOString() ?? null,
      durationMinutes: event.durationMinutes,
      notes: event.notes,
      relatedDoseEventIds: Array.isArray(event.relatedDoseEventIdsJson)
        ? event.relatedDoseEventIdsJson
        : [],
      acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
      safetyContentVersion: event.safetyContentVersion,
      version: event.version,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    },
  };
}
