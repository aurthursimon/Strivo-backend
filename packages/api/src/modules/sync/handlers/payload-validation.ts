import { SyncOperationRejectedError } from '../sync.types';
import { SYNC_MAX_EVENT_AGE_DAYS, SYNC_MAX_FUTURE_SKEW_MINUTES } from '../sync.constants';

export function assertExactPayload(
  payload: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `Campos nao permitidos no payload: ${unexpected.sort().join(', ')}.`,
    );
  }
}

export function requiredNumber(
  payload: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  integer = false,
): number {
  const value = payload[field];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `${field} deve ser um numero${integer ? ' inteiro' : ''} entre ${min} e ${max}.`,
    );
  }
  return value;
}

export function optionalNumber(
  payload: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  integer = false,
): number | undefined {
  if (payload[field] === undefined) return undefined;
  return requiredNumber(payload, field, min, max, integer);
}

export function requiredString(
  payload: Record<string, unknown>,
  field: string,
  maxLength: number,
  options: { allowEmpty?: boolean; pattern?: RegExp } = {},
): string {
  const value = payload[field];
  if (
    typeof value !== 'string' ||
    value.length > maxLength ||
    (!options.allowEmpty && value.trim().length === 0) ||
    (options.pattern && !options.pattern.test(value))
  ) {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `${field} deve ser uma string valida com no maximo ${maxLength} caracteres.`,
    );
  }
  return value;
}

export function optionalString(
  payload: Record<string, unknown>,
  field: string,
  maxLength: number,
  options: { allowEmpty?: boolean; pattern?: RegExp } = {},
): string | undefined {
  if (payload[field] === undefined) return undefined;
  return requiredString(payload, field, maxLength, options);
}

export function requiredBoolean(payload: Record<string, unknown>, field: string): boolean {
  const value = payload[field];
  if (typeof value !== 'boolean') {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `${field} deve ser verdadeiro ou falso.`,
    );
  }
  return value;
}

export function optionalBoolean(
  payload: Record<string, unknown>,
  field: string,
): boolean | undefined {
  if (payload[field] === undefined) return undefined;
  return requiredBoolean(payload, field);
}

export function requiredEnum<T extends string>(
  payload: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = payload[field];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `${field} deve ser um dos valores permitidos: ${allowed.join(', ')}.`,
    );
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  payload: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | undefined {
  if (payload[field] === undefined) return undefined;
  return requiredEnum(payload, field, allowed);
}

export function optionalIsoDate(payload: Record<string, unknown>, field: string): Date | undefined {
  if (payload[field] === undefined) return undefined;
  const value = payload[field];
  if (typeof value !== 'string') {
    throw new SyncOperationRejectedError('SYNC_PAYLOAD_INVALID', `${field} deve ser uma data ISO.`);
  }
  const date = new Date(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(date.getTime())
  ) {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `${field} deve ser uma data ISO valida com fuso horario explicito.`,
    );
  }
  return date;
}

export function requiredStringArray(
  payload: Record<string, unknown>,
  field: string,
  maxItems: number,
  maxItemLength: number,
): string[] {
  const value = payload[field];
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some(
      (item) => typeof item !== 'string' || item.trim().length === 0 || item.length > maxItemLength,
    )
  ) {
    throw new SyncOperationRejectedError(
      'SYNC_PAYLOAD_INVALID',
      `${field} deve ser uma lista de ate ${maxItems} strings validas.`,
    );
  }
  return value as string[];
}

export function optionalStringArray(
  payload: Record<string, unknown>,
  field: string,
  maxItems: number,
  maxItemLength: number,
): string[] | undefined {
  if (payload[field] === undefined) return undefined;
  return requiredStringArray(payload, field, maxItems, maxItemLength);
}

export function assertAppendOnlyMutation(baseVersion: number | undefined): void {
  if (baseVersion !== undefined) {
    throw new SyncOperationRejectedError(
      'SYNC_BASE_VERSION_NOT_ALLOWED',
      'Operacoes append-only nao aceitam baseVersion.',
    );
  }
}

export function assertOccurredAtWithinSyncWindow(occurredAt: Date, now = new Date()): void {
  const occurredTime = occurredAt.getTime();
  if (!Number.isFinite(occurredTime)) {
    throw new SyncOperationRejectedError('SYNC_OCCURRED_AT_INVALID', 'occurredAt e invalido.');
  }

  const futureLimit = now.getTime() + SYNC_MAX_FUTURE_SKEW_MINUTES * 60 * 1000;
  if (occurredTime > futureLimit) {
    throw new SyncOperationRejectedError(
      'SYNC_OCCURRED_AT_IN_FUTURE',
      `occurredAt nao pode estar mais de ${SYNC_MAX_FUTURE_SKEW_MINUTES} minutos no futuro.`,
    );
  }

  const historyLimit = now.getTime() - SYNC_MAX_EVENT_AGE_DAYS * 24 * 60 * 60 * 1000;
  if (occurredTime < historyLimit) {
    throw new SyncOperationRejectedError(
      'SYNC_OCCURRED_AT_TOO_OLD',
      `occurredAt nao pode ser anterior a ${SYNC_MAX_EVENT_AGE_DAYS} dias.`,
    );
  }
}
