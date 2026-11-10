export interface CorsPolicy {
  allowedOrigins: ReadonlySet<string>;
  isOriginAllowed(origin: string | undefined): boolean;
}

function normalizeConfiguredOrigin(value: string): string {
  if (value === 'null') {
    throw new Error('CORS_ORIGINS nao pode autorizar a origem null.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Origem CORS invalida: ${value}`);
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`CORS_ORIGINS deve conter apenas origens HTTP(S) exatas: ${value}`);
  }

  return parsed.origin;
}

function isDevelopmentOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (!['http:', 'https:'].includes(protocol)) return false;

    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return true;
    return (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

export function createCorsPolicy(
  configuredOrigins: string | undefined,
  nodeEnv: string | undefined,
): CorsPolicy {
  const production = nodeEnv === 'production';
  const configured = (configuredOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (production && configured.includes('*')) {
    throw new Error('CORS_ORIGINS nao pode conter * em producao.');
  }

  const allowedOrigins = new Set(
    configured.filter((origin) => origin !== '*').map(normalizeConfiguredOrigin),
  );
  const allowAnyDevelopmentOrigin = !production && configured.includes('*');

  return {
    allowedOrigins,
    isOriginAllowed(origin: string | undefined): boolean {
      // Requests sem Origin nao participam de CORS (apps nativos, jobs e chamadas servidor-servidor).
      if (!origin) return true;
      if (origin === 'null') return false;
      if (allowedOrigins.has(origin)) return true;
      if (!production && (allowAnyDevelopmentOrigin || isDevelopmentOrigin(origin))) return true;
      return false;
    },
  };
}
