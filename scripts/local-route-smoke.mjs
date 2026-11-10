#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const failures = [];
const results = [];

async function request(method, path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function record(method, path, response, expected) {
  const ok = expected(response.status);
  results.push({ method, path, status: response.status, ok });
  const detail = response.payload
    ? {
        code: response.payload.code,
        errors: response.payload.errors,
        details: response.payload.details,
        error: response.payload.error,
        message: response.payload.message,
      }
    : response.error;
  if (!ok) failures.push({ method, path, status: response.status, detail });
}

const docs = await request('GET', '/api/docs-json');
if (docs.status !== 200 || !docs.payload?.paths) {
  throw new Error(`Swagger indisponivel: status=${docs.status}`);
}

const guest = await request('POST', '/api/auth/guest', {
  body: { installationId: `route-smoke-${randomUUID()}-${randomUUID()}` },
});
const token = guest.payload?.data?.accessToken ?? guest.payload?.accessToken;
if (guest.status !== 201 || typeof token !== 'string') {
  throw new Error(`Falha ao criar usuario descartavel: status=${guest.status}`);
}

const onboardingPayload = {
  name: 'Route Smoke',
  locale: 'pt',
  countryCode: 'BR',
  timezone: 'America/Sao_Paulo',
  measurementSystem: 'METRIC',
  regionDetectionSource: 'DEVICE_REGION',
  birthDate: '1996-01-15',
  gender: 'MALE',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'MODERATE',
  dietType: 'omnivore',
  goalType: 'MAINTAIN',
  mealsPerDay: 4,
  restrictions: [],
  dislikedFoods: [],
  notificationsOptIn: false,
};

for (const [pathTemplate, operations] of Object.entries(docs.payload.paths)) {
  for (const method of Object.keys(operations)) {
    const upperMethod = method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod)) continue;
    if (pathTemplate === '/api/users/me' && upperMethod === 'DELETE') continue;

    const path = pathTemplate.replace(/\{[^}]+\}/g, 'route-smoke-not-found');
    let body = ['POST', 'PUT', 'PATCH'].includes(upperMethod) ? {} : undefined;
    const headers = {};

    if (path === '/api/onboarding/preview') body = onboardingPayload;
    if (path === '/api/onboarding/complete') {
      body = onboardingPayload;
      headers['Idempotency-Key'] = `route-smoke-${randomUUID()}`;
    }
    if (path === '/api/onboarding/plans/ensure') body = undefined;

    const response = await request(upperMethod, path, { token, body, headers });
    const expectsSuccess = [
      '/api/onboarding/preview',
      '/api/onboarding/complete',
      '/api/onboarding/plans/ensure',
    ].includes(path);
    const allowsMissingLocalRevenueCat = path === '/api/billing/revenuecat/reconcile';
    record(upperMethod, pathTemplate, response, (status) =>
      expectsSuccess
        ? status >= 200 && status < 300
        : allowsMissingLocalRevenueCat
          ? status === 200 || status === 503
          : status > 0 && status < 500,
    );
  }
}

const cleanup = await request('DELETE', '/api/users/me', { token });
record('DELETE', '/api/users/me', cleanup, (status) => [200, 204].includes(status));

for (const result of results) {
  const label = result.ok ? 'PASS' : 'FAIL';
  console.log(
    `${label} ${result.method.padEnd(6)} ${String(result.status).padStart(3)} ${result.path}`,
  );
}
for (const failure of failures) {
  console.log(`DETAIL ${failure.method} ${failure.path}: ${JSON.stringify(failure.detail)}`);
}
console.log(`SUMMARY routes=${results.length} failures=${failures.length}`);
if (failures.length > 0) process.exitCode = 1;
