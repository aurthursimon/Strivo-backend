type DecimalLike = { toNumber(): number } | number;

const decimal = (value: DecimalLike) => (typeof value === 'number' ? value : value.toNumber());

export function serializeConsent(value: {
  id: string;
  version: string;
  scopesJson: unknown;
  acceptedAt: Date;
  clientAcceptedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: value.id,
    version: value.version,
    scopes: Array.isArray(value.scopesJson) ? value.scopesJson : [],
    acceptedAt: value.acceptedAt,
    clientAcceptedAt: value.clientAcceptedAt,
    revokedAt: value.revokedAt,
  };
}

export function serializeTreatment(value: {
  id: string;
  activeIngredient: string;
  brandName: string | null;
  route: string;
  formulation: string | null;
  medicationMarket: string | null;
  medicationCountryCode: string | null;
  currentDoseMg: DecimalLike;
  intervalHours: DecimalLike;
  usualWeekday: number | null;
  usualLocalTime: string | null;
  timezone: string;
  startedAt: Date | null;
  endedAt: Date | null;
  pausedAt: Date | null;
  status: string;
  source: string;
  sourceReference: string | null;
  notes: string | null;
  startWeightKg: DecimalLike | null;
  baselineSymptomsJson: unknown;
  motivation: string | null;
  cravingPeakDay: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: value.id,
    activeIngredient: value.activeIngredient,
    brandName: value.brandName,
    route: value.route.toLowerCase(),
    formulation: value.formulation,
    medicationMarket: value.medicationMarket?.toLowerCase() ?? null,
    medicationCountryCode: value.medicationCountryCode,
    currentDoseMg: decimal(value.currentDoseMg),
    intervalHours: decimal(value.intervalHours),
    usualWeekday: value.usualWeekday,
    usualLocalTime: value.usualLocalTime,
    timezone: value.timezone,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    pausedAt: value.pausedAt,
    status: value.status.toLowerCase(),
    source: value.source.toLowerCase(),
    sourceReference: value.sourceReference,
    notes: value.notes,
    startWeightKg: value.startWeightKg === null ? null : decimal(value.startWeightKg),
    baselineSymptoms: Array.isArray(value.baselineSymptomsJson) ? value.baselineSymptomsJson : [],
    motivation: value.motivation,
    cravingPeakDay: value.cravingPeakDay,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function serializeDosePlanPeriod(value: {
  id: string;
  treatmentId: string;
  doseMg: DecimalLike;
  intervalHours: DecimalLike;
  validFrom: Date;
  validUntil: Date | null;
  source: string;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: value.id,
    treatmentId: value.treatmentId,
    doseMg: decimal(value.doseMg),
    intervalHours: decimal(value.intervalHours),
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    source: value.source.toLowerCase(),
    notes: value.notes,
    createdAt: value.createdAt,
  };
}

export function serializeDoseEvent(value: {
  id: string;
  treatmentId: string;
  scheduledAt: Date | null;
  reminderAt: Date | null;
  takenAt: Date | null;
  doseMg: DecimalLike;
  status: string;
  route: string;
  injectionSiteCode: string | null;
  painLevel: number | null;
  notes: string | null;
  source: string;
  possibleDuplicateOfId: string | null;
  duplicateConfirmedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: value.id,
    treatmentId: value.treatmentId,
    scheduledAt: value.scheduledAt,
    reminderAt: value.reminderAt,
    takenAt: value.takenAt,
    doseMg: decimal(value.doseMg),
    status: value.status.toLowerCase(),
    route: value.route.toLowerCase(),
    injectionSiteCode: value.injectionSiteCode,
    injectionSite: value.injectionSiteCode,
    siteCode: value.injectionSiteCode,
    painLevel: value.painLevel,
    notes: value.notes,
    source: value.source.toLowerCase(),
    possibleDuplicateOfId: value.possibleDuplicateOfId,
    duplicateConfirmedAt: value.duplicateConfirmedAt,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function serializeSymptom(value: {
  id: string;
  treatmentId: string;
  code: string;
  customName: string | null;
  severity: number;
  occurredAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
  notes: string | null;
  relatedDoseEventIdsJson: unknown;
  acknowledgedAt: Date | null;
  safetyContentVersion: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: value.id,
    treatmentId: value.treatmentId,
    code: value.code,
    customName: value.customName,
    severity: value.severity,
    occurredAt: value.occurredAt,
    endedAt: value.endedAt,
    durationMinutes: value.durationMinutes,
    notes: value.notes,
    relatedDoseEventIds: Array.isArray(value.relatedDoseEventIdsJson)
      ? value.relatedDoseEventIdsJson
      : [],
    acknowledgedAt: value.acknowledgedAt,
    safetyContentVersion: value.safetyContentVersion,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function serializeReminderRule(value: {
  id: string;
  treatmentId: string;
  eventType: string;
  offsetMinutes: number;
  enabled: boolean;
  channel: string;
  timezone: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: value.id,
    treatmentId: value.treatmentId,
    eventType: value.eventType,
    offsetMinutes: value.offsetMinutes,
    enabled: value.enabled,
    channel: value.channel,
    timezone: value.timezone,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function serializeInjectionSite(value: {
  id: string;
  siteCode: string;
  unavailable: boolean;
  notes: string | null;
  version: number;
  updatedAt: Date;
}) {
  return {
    id: value.id,
    siteCode: value.siteCode,
    unavailable: value.unavailable,
    notes: value.notes,
    version: value.version,
    updatedAt: value.updatedAt,
  };
}
