/**
 * Serializers puros de Remedios (DB row -> shape app).
 *
 * Funcoes puras, sem dependencia de Nest/Prisma. reminderTimesJson (Json no
 * banco) volta como string[] no app. Nao expoe campos internos (userId,
 * deletedAt, clientMutationId).
 */

interface MedicationRow {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  reminderTimesJson: unknown;
  notes?: string | null;
  createdAt: Date | string;
}

interface MedicationLogRow {
  id: string;
  medicationId: string;
  takenAt: Date | string;
  skipped: boolean;
}

interface ConsentRow {
  acceptedAt: Date | string;
  version: string;
}

/** reminderTimesJson -> string[] defensivo (Json pode ser qualquer coisa). */
function toReminderTimes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function serializeMedication(med: MedicationRow) {
  return {
    id: med.id,
    name: med.name,
    dosage: med.dosage,
    frequency: med.frequency,
    reminderTimes: toReminderTimes(med.reminderTimesJson),
    notes: med.notes ?? undefined,
    createdAt: med.createdAt,
  };
}

export function serializeMedicationLog(log: MedicationLogRow) {
  return {
    id: log.id,
    medicationId: log.medicationId,
    takenAt: log.takenAt,
    skipped: log.skipped,
  };
}

export function serializeConsent(consent: ConsentRow | null) {
  if (!consent) return { acceptedAt: undefined, version: undefined };
  return { acceptedAt: consent.acceptedAt, version: consent.version };
}
