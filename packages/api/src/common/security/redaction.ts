const SENSITIVE_QUERY_KEYS =
  /([?&](?:code|token|access_token|refresh_token|id_token|key|api_key)=)[^&\s]+/gi;

export function redactOperationalText(value: string, maxLength = 500): string {
  return value
    .replace(SENSITIVE_QUERY_KEYS, '$1[Redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+)\b/g, '[CredentialRedacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [Redacted]')
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
