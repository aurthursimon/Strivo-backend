/**
 * Pure helper to normalize an HTTP `Accept-Language` header into a supported
 * application locale. Dependency-free on purpose (no Nest/Prisma/common barrel)
 * so it can be imported via its leaf path from controllers without triggering
 * config/process.exit side effects.
 *
 * Supported locales: 'pt' | 'en' | 'es'. Any other language is ignored.
 */

type SupportedLocale = 'pt' | 'en' | 'es';

function mapTag(tag: string): SupportedLocale | undefined {
  if (tag.startsWith('pt')) {
    return 'pt';
  }
  if (tag.startsWith('en')) {
    return 'en';
  }
  if (tag.startsWith('es')) {
    return 'es';
  }
  return undefined;
}

function parseQuality(params: string[]): number {
  for (const param of params) {
    const [rawKey, rawValue] = param.split('=');
    if (rawKey?.trim().toLowerCase() !== 'q') {
      continue;
    }
    const parsed = Number(rawValue);
    // Malformed q values clamp to 0 (lowest priority).
    return Number.isFinite(parsed) ? parsed : 0;
  }
  // Missing q defaults to 1.0.
  return 1.0;
}

export function normalizeAcceptLanguage(header?: string): SupportedLocale | undefined {
  if (!header || !header.trim()) {
    return undefined;
  }

  let best: SupportedLocale | undefined;
  let bestQuality = -1;

  const entries = header.split(',');
  for (const entry of entries) {
    const parts = entry.split(';');
    const tag = parts[0]?.trim().toLowerCase() ?? '';
    const mapped = mapTag(tag);
    if (!mapped) {
      continue;
    }
    const quality = parseQuality(parts.slice(1));
    // Strictly greater keeps the first by appearance order on ties.
    if (quality > bestQuality) {
      best = mapped;
      bestQuality = quality;
    }
  }

  return best;
}
