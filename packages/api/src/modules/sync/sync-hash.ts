import { createHash } from 'crypto';
import type { SyncMutationDto } from './dto';

function canonicalize(value: unknown): string {
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Numero nao finito no payload de sync.');
      return JSON.stringify(value);
    case 'object': {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
        .join(',')}}`;
    }
    default:
      throw new TypeError('Valor nao serializavel no payload de sync.');
  }
}

export function hashSyncMutation(mutation: SyncMutationDto): string {
  return createHash('sha256').update(canonicalize(mutation)).digest('hex');
}

export function serializedSyncSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
