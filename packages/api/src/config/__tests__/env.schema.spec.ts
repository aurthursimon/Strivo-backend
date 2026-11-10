import { envSchema } from '../env.schema';

const baseEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/nutriscan',
  JWT_ACCESS_SECRET: 'access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-32-characters',
};

const appleIapEnv = {
  APPLE_IAP_KEY_ID: 'TESTKEY123',
  APPLE_IAP_ISSUER_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  APPLE_IAP_PRIVATE_KEY_BASE64: 'dGVzdA==',
};

const appleServerEnv = {
  APPLE_CLIENT_ID: 'app.mypeptides.glp1',
  APPLE_TEAM_ID: 'TSZ4D2L9R6',
  APPLE_KEY_ID: 'KY7A6J6P32',
  APPLE_PRIVATE_KEY_BASE64: 'base64-private-key-for-tests',
  APPLE_TOKEN_ENCRYPTION_KEY_ID: 'apple-test-v1',
  APPLE_TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
};

// Only the markets render.yaml actually declares Price IDs for - ES/PH/IN
// are deliberately absent here, same as production, to pin down that Stripe
// billing boots without them (see priceForMarket()'s graceful 503 instead).
const stripeCoreMarketsEnv = {
  STRIPE_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_live_' + 'x'.repeat(20),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'x'.repeat(20),
  STRIPE_PRICE_US_WEEKLY: 'price_us_weekly',
  STRIPE_PRICE_US_MONTHLY: 'price_us_monthly',
  STRIPE_PRICE_US_YEARLY: 'price_us_yearly',
  STRIPE_PRICE_CA_WEEKLY: 'price_ca_weekly',
  STRIPE_PRICE_CA_MONTHLY: 'price_ca_monthly',
  STRIPE_PRICE_CA_YEARLY: 'price_ca_yearly',
  STRIPE_PRICE_GB_WEEKLY: 'price_gb_weekly',
  STRIPE_PRICE_GB_MONTHLY: 'price_gb_monthly',
  STRIPE_PRICE_GB_YEARLY: 'price_gb_yearly',
  STRIPE_PRICE_DE_WEEKLY: 'price_de_weekly',
  STRIPE_PRICE_DE_MONTHLY: 'price_de_monthly',
  STRIPE_PRICE_DE_YEARLY: 'price_de_yearly',
  STRIPE_PRICE_FR_WEEKLY: 'price_fr_weekly',
  STRIPE_PRICE_FR_MONTHLY: 'price_fr_monthly',
  STRIPE_PRICE_FR_YEARLY: 'price_fr_yearly',
};

describe('envSchema billing safety', () => {
  it('permite producao com Stripe habilitado sem os precos de ES/PH/IN (render.yaml nao os declara)', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'production',
      ...stripeCoreMarketsEnv,
    });
    expect(result.success).toBe(true);
  });

  it('exige STRIPE_SECRET_KEY quando STRIPE_ENABLED=true, mesmo com os mercados principais configurados', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'production',
      ...stripeCoreMarketsEnv,
      STRIPE_SECRET_KEY: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('permite desenvolvimento sem Apple IAP', () => {
    expect(envSchema.safeParse({ ...baseEnv, NODE_ENV: 'development' }).success).toBe(true);
  });

  it('permite producao sem Apple IAP quando o provedor nao esta configurado', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'production',
      APPLE_IAP_KEY_ID: undefined,
    });

    expect(result.success).toBe(true);
  });

  it('aceita producao com integracao Apple IAP completa', () => {
    expect(
      envSchema.safeParse({
        ...baseEnv,
        ...appleIapEnv,
        NODE_ENV: 'production',
      }).success,
    ).toBe(true);
  });

  it('permite Gemini sozinho, sem OpenAI configurado (roda sem fallback)', () => {
    expect(
      envSchema.safeParse({
        ...baseEnv,
        NODE_ENV: 'development',
        GEMINI_API_KEY: 'gemini-test-key',
      }).success,
    ).toBe(true);
  });

  it('permite OpenAI sozinho, sem Gemini configurado (roda sem fallback)', () => {
    expect(
      envSchema.safeParse({
        ...baseEnv,
        NODE_ENV: 'development',
        OPENAI_API_KEY: 'openai-test-key',
      }).success,
    ).toBe(true);
  });

  it('permite scan sem nenhum provedor de IA configurado (feature fica indisponivel)', () => {
    expect(envSchema.safeParse({ ...baseEnv, NODE_ENV: 'development' }).success).toBe(true);
  });

  it('aceita Gemini e OpenAI configurados juntos', () => {
    expect(
      envSchema.safeParse({
        ...baseEnv,
        NODE_ENV: 'development',
        GEMINI_API_KEY: 'gemini-test-key',
        OPENAI_API_KEY: 'openai-test-key',
      }).success,
    ).toBe(true);
  });

  it('rejeita producao com Apple client id sem credenciais de troca e revogacao', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      ...appleIapEnv,
      NODE_ENV: 'production',
      APPLE_CLIENT_ID: 'app.mypeptides.glp1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['APPLE_TEAM_ID'] }),
          expect.objectContaining({ path: ['APPLE_KEY_ID'] }),
          expect.objectContaining({ path: ['APPLE_PRIVATE_KEY_BASE64'] }),
        ]),
      );
    }
  });

  it('aceita producao com integracao Apple completa', () => {
    expect(
      envSchema.safeParse({
        ...baseEnv,
        ...appleIapEnv,
        ...appleServerEnv,
        NODE_ENV: 'production',
      }).success,
    ).toBe(true);
  });

  it('rejeita access tokens cuja duracao ultrapassa a retencao do receipt', () => {
    for (const JWT_ACCESS_EXPIRATION of ['31d', '0s', 'duracao-invalida']) {
      const result = envSchema.safeParse({
        ...baseEnv,
        NODE_ENV: 'development',
        JWT_ACCESS_EXPIRATION,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: ['JWT_ACCESS_EXPIRATION'] })]),
        );
      }
    }
  });

  it('aceita access token com duracao positiva de no maximo 30 dias', () => {
    expect(
      envSchema.safeParse({
        ...baseEnv,
        NODE_ENV: 'development',
        JWT_ACCESS_EXPIRATION: '30d',
      }).success,
    ).toBe(true);
  });

  it('valida a chave corrente e o keyring anterior da Apple', () => {
    const validPreviousKey = Buffer.alloc(32, 9).toString('base64');
    expect(
      envSchema.safeParse({
        ...baseEnv,
        ...appleServerEnv,
        NODE_ENV: 'development',
        APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
          'apple-test-v0': validPreviousKey,
        }),
      }).success,
    ).toBe(true);

    expect(
      envSchema.safeParse({
        ...baseEnv,
        ...appleServerEnv,
        NODE_ENV: 'development',
        APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS: '{"apple-test-v0":"short"}',
      }).success,
    ).toBe(false);
  });
});

it('rejects partial Apple purchase credentials', () => {
  const result = envSchema.safeParse({ ...baseEnv, APPLE_IAP_KEY_ID: 'TESTKEY123' });
  expect(result.success).toBe(false);
});
it('pins the Apple product and validates environment and issuer', () => {
  expect(envSchema.safeParse({ ...baseEnv, ...appleIapEnv }).success).toBe(true);
  for (const value of [{ APPLE_IAP_MONTHLY_PRODUCT_ID: 'other' }, { APPLE_IAP_ENVIRONMENT: 'test' }, { APPLE_IAP_ISSUER_ID: 'not-a-uuid' }]) {
    expect(envSchema.safeParse({ ...baseEnv, ...appleIapEnv, ...value }).success).toBe(false);
  }
});

it('accepts the standard mailto URI used by the local web-push configuration', () => {
  expect(envSchema.safeParse({ ...baseEnv, VAPID_SUBJECT: 'mailto:push@example.com' }).success).toBe(true);
  expect(envSchema.safeParse({ ...baseEnv, VAPID_SUBJECT: 'mailto:invalid' }).success).toBe(false);
});

it('defaults Apple purchase verification to the existing Strivo App Store bundle', () => {
  const env = envSchema.parse(baseEnv);
  expect(env.APPLE_IAP_BUNDLE_ID).toBe('com.strivo.fitness.app');
});
