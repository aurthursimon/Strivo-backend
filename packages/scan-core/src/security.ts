import { createHash } from 'node:crypto';

const SENSITIVE_QUERY_KEYS =
  /([?&](?:code|token|access_token|refresh_token|id_token|key|api_key)=)[^&\s]+/gi;

export function redactOperationalText(value: string, maxLength = 500): string {
  return value
    .replace(SENSITIVE_QUERY_KEYS, '$1[Redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+)\b/g, '[CredentialRedacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [Redacted]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/_=-]+/gi, '[ImageDataRedacted]')
    .replace(/\b[A-Za-z0-9+/_-]{128,}={0,2}\b/g, '[OpaqueDataRedacted]')
    .replace(/https?:\/\/[^\s?]+(?:\?[^\s]*)?/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return '[UrlRedacted]';
      }
    })
    .slice(0, maxLength);
}

export function errorMessage(error: unknown): string {
  return redactOperationalText(error instanceof Error ? error.message : String(error));
}

export function operationalErrorFingerprint(error: unknown): string {
  const errorType = error instanceof Error ? error.name : typeof error;
  return createHash('sha256')
    .update(`${errorType}\u0000${errorMessage(error)}`)
    .digest('hex')
    .slice(0, 16);
}
