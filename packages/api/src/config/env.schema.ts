import { z } from 'zod';
import * as ms from 'ms';

const APPLE_LEGACY_KEY_ID = 'legacy-jwt-refresh-v1';
const ACCOUNT_DELETION_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

function isValidAccessTokenDuration(value: string): boolean {
  const duration = ms(value as ms.StringValue);
  return (
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration > 0 &&
    duration <= ACCOUNT_DELETION_RECEIPT_RETENTION_MS
  );
}

function isBase64EncryptionKey(value: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, 'base64').length === 32;
}

function isValidPreviousAppleKeys(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.entries(parsed).every(
        ([keyId, key]) =>
          /^[A-Za-z0-9._-]{1,64}$/.test(keyId) &&
          typeof key === 'string' &&
          isBase64EncryptionKey(key),
      )
    );
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    API_URL: z.string().url().default('http://localhost:3000'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    // frontend-mobile's own public URL (the Expo Router web/PWA build),
    // distinct from FRONTEND_URL (web-funnel, the marketing/checkout
    // funnel) - used for links that must open inside the app itself, like
    // the password reset email. web-funnel proxies /app/* to this same
    // origin (see web-funnel/vercel.json), so this is also reachable at
    // FRONTEND_URL + '/app'; kept as its own var since the API shouldn't
    // assume that proxy relationship.
    APP_URL: z.string().url().default('http://localhost:8081/app'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    DATABASE_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRATION: z
      .string()
      .refine(isValidAccessTokenDuration, {
        message: 'Must be a positive duration no greater than 30 days',
      })
      .default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRATION: z.string().default('7d'),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
    GOOGLE_IOS_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().url().default('http://localhost:3000/api/auth/google/callback'),
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY_BASE64: z.string().optional(),
    APPLE_TOKEN_ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/)
      .refine((value) => value !== APPLE_LEGACY_KEY_ID, {
        message: `${APPLE_LEGACY_KEY_ID} is reserved for legacy ciphertext`,
      })
      .optional(),
    APPLE_TOKEN_ENCRYPTION_KEY_BASE64: z
      .string()
      .refine(isBase64EncryptionKey, { message: 'Must be a base64-encoded 32-byte key' })
      .optional(),
    APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS: z
      .string()
      .max(32_768)
      .refine(isValidPreviousAppleKeys, {
        message: 'Must be a JSON object of key ids to base64-encoded 32-byte keys',
      })
      .optional(),

    // AI food-photo scanning (see modules/scan). Each key is independently
    // optional - if neither is set, the scan endpoints return a clean 503
    // instead of the app failing to boot, same posture as Stripe/RevenueCat
    // below. With both set, Gemini is primary and OpenAI is the fallback
    // used when Gemini fails, times out, or its circuit breaker is open.
    // With only one set, that provider runs alone with no fallback.
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_SCAN_MODEL: z.string().min(1).default('gpt-5-nano'),
    SCAN_PRIMARY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(6_000),
    SCAN_FALLBACK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(8_000),
    SCAN_JOB_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SCAN_FEEDBACK_TTL_DAYS: z.coerce.number().int().min(30).max(730).default(180),
    SCAN_FEEDBACK_DAILY_LIMIT: z.coerce.number().int().min(5).max(100).default(10),
    SCAN_FEEDBACK_MIN_INTERVAL_MS: z.coerce.number().int().min(100).max(10_000).default(1_000),

    ENABLE_LOAD_TEST: z
      .string()
      .optional()
      .transform((value) =>
        value ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : false,
      ),
    LOAD_TEST_KEY: z.string().min(32).optional(),

    RATE_LIMIT_ENABLED: z
      .string()
      .optional()
      .transform((value) => value !== 'false'),
    BACKGROUND_JOBS_ENABLED: z
      .string()
      .optional()
      .transform((value) => value !== 'false'),

    STRIPE_ENABLED: z
      .string()
      .optional()
      .transform((value) =>
        value ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : false,
      ),
    STRIPE_SECRET_KEY: z.string().min(20).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(20).optional(),
    STRIPE_PRICE_US_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_US_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_US_YEARLY: z.string().min(1).optional(),
    STRIPE_PRICE_CA_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_CA_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_CA_YEARLY: z.string().min(1).optional(),
    STRIPE_PRICE_GB_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_GB_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_GB_YEARLY: z.string().min(1).optional(),
    STRIPE_PRICE_DE_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_DE_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_DE_YEARLY: z.string().min(1).optional(),
    STRIPE_PRICE_FR_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_FR_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_FR_YEARLY: z.string().min(1).optional(),
    // ES intentionally not in the required-when-STRIPE_ENABLED list below:
    // launching Spain reuses DE's exact EUR price amounts (see pricing.ts),
    // but real Stripe Price IDs for ES still need the product owner to
    // configure these three on Render before Spanish checkout goes live.
    // Until then, priceForMarket() returns a clean 503 for market=ES instead
    // of a boot crash.
    STRIPE_PRICE_ES_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_ES_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_ES_YEARLY: z.string().min(1).optional(),
    // PH also not required-when-STRIPE_ENABLED, same reason as ES above:
    // render.yaml never declared these three, so a production boot with
    // STRIPE_ENABLED=true and no Philippines Price IDs set must not crash -
    // priceForMarket() already returns a clean 503 for market=PH until the
    // product owner configures the real Price IDs on Render.
    STRIPE_PRICE_PH_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_PH_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_PH_YEARLY: z.string().min(1).optional(),
    // IN also not required-when-STRIPE_ENABLED: the product owner has real
    // Price IDs for India (set these three on Render), but no confirmed INR
    // display amount yet, so India isn't offered as a choosable checkout
    // market on the frontend until that's provided - see pricing.ts. These
    // three exist now specifically so a webhook for one of those Price IDs
    // (e.g. Stripe's own retry of an earlier failed delivery) resolves
    // correctly instead of throwing 'Stripe price nao reconhecido'.
    STRIPE_PRICE_IN_WEEKLY: z.string().min(1).optional(),
    STRIPE_PRICE_IN_MONTHLY: z.string().min(1).optional(),
    STRIPE_PRICE_IN_YEARLY: z.string().min(1).optional(),

    // Meta Conversions API - server-side Purchase reporting, fired from the
    // Stripe webhook (see MetaCapiService). Both optional and independently
    // checked (isConfigured()): same posture as Stripe/RevenueCat above,
    // never a boot requirement, a no-op until both are set.
    META_PIXEL_ID: z.string().min(1).optional(),
    META_CAPI_ACCESS_TOKEN: z.string().min(1).optional(),

    // Transactional email (password reset) via Resend's HTTP API - same
    // posture as Meta CAPI above: optional, isConfigured() checked, a no-op
    // (logged, never thrown) until both are set. EMAIL_FROM must be a
    // sender address verified on the Resend account.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().email().optional(),
    // In-app "Contact support" (see SupportService): the inbox messages are
    // forwarded to. Without this, the endpoint answers 503 rather than
    // silently dropping the message or claiming it was sent - see
    // SupportService.isConfigured().
    SUPPORT_EMAIL: z.string().email().optional(),

    // AI support chat (see modules/support-chat) - deliberately its own
    // Gemini key, never GEMINI_API_KEY (see modules/scan above). Sharing one
    // key would mean a burst of chat traffic and a burst of scan traffic
    // draw against the same quota/budget, so either feature could starve
    // the other; a dedicated key keeps them independent and separately
    // attributable in Google AI Studio's usage dashboard. Optional, same
    // posture as every other integration here - absent in an environment,
    // the chat endpoints answer a clean 503 instead of failing to boot. See
    // SupportChatService.isConfigured().
    SUPPORT_CHAT_GEMINI_API_KEY: z.string().min(1).optional(),
    SUPPORT_CHAT_GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
    TRAINING_GEMINI_API_KEY: z.string().min(1).optional(),
    TRAINING_GEMINI_MODEL: z.string().min(1).optional(),
    SUPPORT_CHAT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000),

    APPLE_IAP_SHARED_SECRET: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
    APPLE_IAP_KEY_ID: z.string().min(1).optional(),
    APPLE_IAP_ISSUER_ID: z.string().uuid().optional(),
    APPLE_IAP_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
    APPLE_IAP_BUNDLE_ID: z.string().min(1).default('com.strivo.fitness.app'),
    APPLE_IAP_APP_ID: z.coerce.number().int().positive().default(6826407080),
    APPLE_IAP_MONTHLY_PRODUCT_ID: z.literal('monthly_29_99').default('monthly_29_99'),
    APPLE_IAP_ENVIRONMENT: z.enum(['Sandbox', 'Production']).default('Production'),

    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().refine((value) => z.string().email().safeParse(value.replace(/^mailto:/, '')).success, 'Must be an email address or mailto email URI').optional(),

    MUSCLEWIKI_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const appleServerCredentials = [
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY_BASE64',
      'APPLE_TOKEN_ENCRYPTION_KEY_ID',
      'APPLE_TOKEN_ENCRYPTION_KEY_BASE64',
    ] as const;
    const appleServerFlowRequired =
      appleServerCredentials.some((field) => Boolean(env[field])) ||
      (env.NODE_ENV === 'production' && Boolean(env.APPLE_CLIENT_ID));
    if (appleServerFlowRequired) {
      for (const field of ['APPLE_CLIENT_ID', ...appleServerCredentials] as const) {
        if (!env[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Required when Apple token exchange and revocation are configured',
          });
        }
      }
    }

    if (env.ENABLE_LOAD_TEST && !env.LOAD_TEST_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOAD_TEST_KEY'],
        message: 'Required when ENABLE_LOAD_TEST is true',
      });
    }

    const stripeFields = [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_US_WEEKLY',
      'STRIPE_PRICE_US_MONTHLY',
      'STRIPE_PRICE_US_YEARLY',
      'STRIPE_PRICE_CA_WEEKLY',
      'STRIPE_PRICE_CA_MONTHLY',
      'STRIPE_PRICE_CA_YEARLY',
      'STRIPE_PRICE_GB_WEEKLY',
      'STRIPE_PRICE_GB_MONTHLY',
      'STRIPE_PRICE_GB_YEARLY',
      'STRIPE_PRICE_DE_WEEKLY',
      'STRIPE_PRICE_DE_MONTHLY',
      'STRIPE_PRICE_DE_YEARLY',
      'STRIPE_PRICE_FR_WEEKLY',
      'STRIPE_PRICE_FR_MONTHLY',
      'STRIPE_PRICE_FR_YEARLY',
    ] as const;
    const stripeValues = stripeFields.map((field) => env[field]);
    if (env.STRIPE_ENABLED || stripeValues.some(Boolean)) {
      if (!env.STRIPE_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STRIPE_ENABLED'],
          message: 'Must be true when Stripe configuration is provided',
        });
      }
      for (const field of stripeFields) {
        if (!env[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Required when Stripe billing is enabled',
          });
        }
      }
    }

    const appleIapFields = [
      'APPLE_IAP_KEY_ID',
      'APPLE_IAP_ISSUER_ID',
      'APPLE_IAP_PRIVATE_KEY_BASE64',
    ] as const;
    if (appleIapFields.some((field) => Boolean(env[field]))) {
      for (const field of appleIapFields) {
        if (!env[field])
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Required for direct Apple purchases',
          });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
