BEGIN;

CREATE TYPE "BillingProvider" AS ENUM (
  'STRIPE',
  'APP_STORE',
  'PLAY_STORE',
  'REVENUECAT_UNKNOWN'
);

CREATE TYPE "BillingManagementProvider" AS ENUM (
  'STRIPE',
  'APP_STORE',
  'PLAY_STORE',
  'REVENUECAT_UNKNOWN',
  'NONE'
);

CREATE TYPE "CheckoutAttemptState" AS ENUM (
  'RESERVED',
  'SESSION_CREATED',
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE "BillingPlatform" AS ENUM ('IOS', 'ANDROID');

CREATE TYPE "BillingOutboxKind" AS ENUM (
  'REVENUECAT_MIRROR',
  'GOOGLE_CREATE',
  'GOOGLE_REFUND'
);

CREATE TYPE "BillingOutboxState" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'COMPLETED'
);

CREATE TYPE "GoogleExternalTransactionKind" AS ENUM (
  'INITIAL_PURCHASE',
  'TRIAL_START',
  'RENEWAL',
  'REFUND'
);

CREATE TYPE "GoogleExternalTransactionState" AS ENUM (
  'PENDING',
  'REPORTED',
  'REFUNDED',
  'FAILED'
);

DO $$
BEGIN
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'gen_random_uuid() is required for opaque billing subjects';
  END IF;
END
$$;

CREATE TABLE "billing_subjects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT,
  "detachedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_subjects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_subjects_detach_state" CHECK (
    ("userId" IS NOT NULL AND "detachedAt" IS NULL)
    OR ("userId" IS NULL AND "detachedAt" IS NOT NULL)
  )
);

CREATE TABLE "billing_subscriptions" (
  "id" TEXT NOT NULL,
  "billingSubjectId" UUID NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "providerSubscriptionId" TEXT NOT NULL,
  "providerCustomerId" TEXT,
  "providerOriginalTransactionId" TEXT,
  "providerStore" TEXT,
  "providerEnvironment" TEXT,
  "status" "SubscriptionStatus" NOT NULL,
  "plan" "PlanType" NOT NULL,
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "trialStart" TIMESTAMP(3),
  "trialEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "rawVersion" INTEGER NOT NULL DEFAULT 1,
  "legacySubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_subscriptions_period_valid" CHECK (
    "currentPeriodEnd" >= "currentPeriodStart"
    AND ("trialEnd" IS NULL OR "trialStart" IS NULL OR "trialEnd" >= "trialStart")
  ),
  CONSTRAINT "billing_subscriptions_raw_version_positive" CHECK ("rawVersion" >= 1)
);

CREATE TABLE "premium_entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "inGracePeriod" BOOLEAN NOT NULL DEFAULT false,
  "validUntil" TIMESTAMP(3),
  "managementProvider" "BillingManagementProvider" NOT NULL DEFAULT 'NONE',
  "sourceProvider" "BillingProvider",
  "status" "SubscriptionStatus",
  "plan" "PlanType",
  "trialEnd" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "derivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "premium_entitlements_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "premium_entitlements_inactive_state" CHECK (
    "active"
    OR (
      NOT "inGracePeriod"
      AND "validUntil" IS NULL
      AND "managementProvider" = 'NONE'::"BillingManagementProvider"
      AND "sourceProvider" IS NULL
      AND "status" IS NULL
      AND "plan" IS NULL
      AND "trialEnd" IS NULL
      AND "currentPeriodEnd" IS NULL
      AND NOT "cancelAtPeriodEnd"
    )
  )
);

CREATE TABLE "premium_trial_uses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "firstProvider" "BillingProvider" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "sourceSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_trial_uses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "plan" "PlanType" NOT NULL,
  "platform" "BillingPlatform" NOT NULL,
  "state" "CheckoutAttemptState" NOT NULL DEFAULT 'RESERVED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stripeSessionId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_attempts_completion_state" CHECK (
    ("state" = 'COMPLETED'::"CheckoutAttemptState" AND "completedAt" IS NOT NULL)
    OR ("state" <> 'COMPLETED'::"CheckoutAttemptState")
  )
);

CREATE TABLE "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "objectId" TEXT,
  "type" TEXT NOT NULL,
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "eventCreatedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stripe_webhook_events_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE TABLE "external_link_launches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "checkoutAttemptId" UUID,
  "tokenCiphertext" TEXT NOT NULL,
  "tokenIv" TEXT NOT NULL,
  "tokenTag" TEXT NOT NULL,
  "tokenKeyId" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_link_launches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_link_launches_encrypted_token_present" CHECK (
    length("tokenCiphertext") > 0
    AND length("tokenIv") > 0
    AND length("tokenTag") > 0
    AND length("tokenKeyId") > 0
  )
);

CREATE TABLE "google_external_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "externalLinkLaunchId" UUID,
  "sourceEventId" TEXT NOT NULL,
  "sourceInvoiceId" TEXT,
  "sourceRefundId" TEXT,
  "externalTransactionId" TEXT NOT NULL,
  "initialExternalTransactionId" TEXT,
  "kind" "GoogleExternalTransactionKind" NOT NULL,
  "amountMicros" BIGINT NOT NULL,
  "taxMicros" BIGINT,
  "currency" CHAR(3) NOT NULL,
  "state" "GoogleExternalTransactionState" NOT NULL DEFAULT 'PENDING',
  "policyVersion" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "google_external_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "google_external_transactions_amounts_nonnegative" CHECK (
    "amountMicros" >= 0 AND ("taxMicros" IS NULL OR "taxMicros" >= 0)
  ),
  CONSTRAINT "google_external_transactions_policy_present" CHECK (
    length(btrim("policyVersion")) > 0
  )
);

CREATE TABLE "billing_outbox_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "kind" "BillingOutboxKind" NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadJson" JSONB,
  "state" "BillingOutboxState" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_outbox_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_outbox_jobs_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "billing_outbox_jobs_lease_state" CHECK (
    (
      "state" = 'PROCESSING'::"BillingOutboxState"
      AND "leaseToken" IS NOT NULL
      AND "leaseExpiresAt" IS NOT NULL
      AND "lastAttemptAt" IS NOT NULL
    )
    OR (
      "state" <> 'PROCESSING'::"BillingOutboxState"
      AND "leaseToken" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "billing_subjects_userId_key" ON "billing_subjects"("userId");
CREATE INDEX "billing_subjects_detachedAt_idx" ON "billing_subjects"("detachedAt");
CREATE UNIQUE INDEX "billing_subscriptions_provider_providerSubscriptionId_key"
  ON "billing_subscriptions"("provider", "providerSubscriptionId");
CREATE UNIQUE INDEX "billing_subscriptions_legacySubscriptionId_key"
  ON "billing_subscriptions"("legacySubscriptionId");
CREATE INDEX "billing_subscriptions_billingSubjectId_status_currentPeriodEnd_idx"
  ON "billing_subscriptions"("billingSubjectId", "status", "currentPeriodEnd");
CREATE INDEX "billing_subscriptions_provider_providerCustomerId_idx"
  ON "billing_subscriptions"("provider", "providerCustomerId");
CREATE INDEX "billing_subscriptions_provider_providerOriginalTransactionId_idx"
  ON "billing_subscriptions"("provider", "providerOriginalTransactionId");
CREATE UNIQUE INDEX "premium_entitlements_billingSubjectId_key"
  ON "premium_entitlements"("billingSubjectId");
CREATE INDEX "premium_entitlements_active_validUntil_idx"
  ON "premium_entitlements"("active", "validUntil");
CREATE UNIQUE INDEX "premium_trial_uses_billingSubjectId_key"
  ON "premium_trial_uses"("billingSubjectId");
CREATE INDEX "premium_trial_uses_startedAt_idx" ON "premium_trial_uses"("startedAt");
CREATE UNIQUE INDEX "checkout_attempts_stripeSessionId_key"
  ON "checkout_attempts"("stripeSessionId");
CREATE UNIQUE INDEX "checkout_attempts_idempotencyKey_key"
  ON "checkout_attempts"("idempotencyKey");
CREATE INDEX "checkout_attempts_billingSubjectId_state_expiresAt_idx"
  ON "checkout_attempts"("billingSubjectId", "state", "expiresAt");
CREATE UNIQUE INDEX "checkout_attempts_one_live_per_subject_idx"
  ON "checkout_attempts"("billingSubjectId")
  WHERE "state" IN ('RESERVED'::"CheckoutAttemptState", 'SESSION_CREATED'::"CheckoutAttemptState");
CREATE INDEX "stripe_webhook_events_status_createdAt_idx"
  ON "stripe_webhook_events"("status", "createdAt");
CREATE INDEX "stripe_webhook_events_objectId_eventCreatedAt_idx"
  ON "stripe_webhook_events"("objectId", "eventCreatedAt");
CREATE UNIQUE INDEX "external_link_launches_checkoutAttemptId_key"
  ON "external_link_launches"("checkoutAttemptId");
CREATE INDEX "external_link_launches_billingSubjectId_createdAt_idx"
  ON "external_link_launches"("billingSubjectId", "createdAt");
CREATE UNIQUE INDEX "google_external_transactions_sourceEventId_key"
  ON "google_external_transactions"("sourceEventId");
CREATE UNIQUE INDEX "google_external_transactions_externalTransactionId_key"
  ON "google_external_transactions"("externalTransactionId");
CREATE INDEX "google_external_transactions_billingSubjectId_createdAt_idx"
  ON "google_external_transactions"("billingSubjectId", "createdAt");
CREATE INDEX "google_external_transactions_sourceInvoiceId_idx"
  ON "google_external_transactions"("sourceInvoiceId");
CREATE INDEX "google_external_transactions_sourceRefundId_idx"
  ON "google_external_transactions"("sourceRefundId");
CREATE INDEX "google_external_transactions_state_updatedAt_idx"
  ON "google_external_transactions"("state", "updatedAt");
CREATE UNIQUE INDEX "billing_outbox_jobs_idempotencyKey_key"
  ON "billing_outbox_jobs"("idempotencyKey");
CREATE INDEX "billing_outbox_jobs_state_nextAttemptAt_leaseExpiresAt_idx"
  ON "billing_outbox_jobs"("state", "nextAttemptAt", "leaseExpiresAt");
CREATE INDEX "billing_outbox_jobs_billingSubjectId_kind_idx"
  ON "billing_outbox_jobs"("billingSubjectId", "kind");
CREATE INDEX "billing_outbox_jobs_aggregateType_aggregateId_idx"
  ON "billing_outbox_jobs"("aggregateType", "aggregateId");

ALTER TABLE "billing_subjects"
  ADD CONSTRAINT "billing_subjects_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "premium_entitlements"
  ADD CONSTRAINT "premium_entitlements_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "premium_trial_uses"
  ADD CONSTRAINT "premium_trial_uses_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_attempts"
  ADD CONSTRAINT "checkout_attempts_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_link_launches"
  ADD CONSTRAINT "external_link_launches_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "external_link_launches_checkoutAttemptId_fkey"
  FOREIGN KEY ("checkoutAttemptId") REFERENCES "checkout_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "google_external_transactions"
  ADD CONSTRAINT "google_external_transactions_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "google_external_transactions_externalLinkLaunchId_fkey"
  FOREIGN KEY ("externalLinkLaunchId") REFERENCES "external_link_launches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_outbox_jobs"
  ADD CONSTRAINT "billing_outbox_jobs_billingSubjectId_fkey"
  FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every live user receives one opaque billing subject. The subject can later
-- detach from the authenticating user without exposing that user's identity.
INSERT INTO "billing_subjects" ("id", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

-- The legacy row remains unchanged. Provider mapping uses only the stored
-- RevenueCat store field. Unknown values remain explicit and are never guessed
-- from locale, device platform, country, or network metadata.
INSERT INTO "billing_subscriptions" (
  "id",
  "billingSubjectId",
  "provider",
  "providerSubscriptionId",
  "providerOriginalTransactionId",
  "providerStore",
  "providerEnvironment",
  "status",
  "plan",
  "currentPeriodStart",
  "currentPeriodEnd",
  "trialStart",
  "trialEnd",
  "cancelAtPeriodEnd",
  "canceledAt",
  "sourceUpdatedAt",
  "rawVersion",
  "legacySubscriptionId",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy:' || legacy."id",
  subject."id",
  CASE upper(COALESCE(legacy."revenueCatStore", ''))
    WHEN 'APP_STORE' THEN 'APP_STORE'::"BillingProvider"
    WHEN 'APPSTORE' THEN 'APP_STORE'::"BillingProvider"
    WHEN 'MAC_APP_STORE' THEN 'APP_STORE'::"BillingProvider"
    WHEN 'PLAY_STORE' THEN 'PLAY_STORE'::"BillingProvider"
    WHEN 'PLAYSTORE' THEN 'PLAY_STORE'::"BillingProvider"
    WHEN 'GOOGLE_PLAY' THEN 'PLAY_STORE'::"BillingProvider"
    ELSE 'REVENUECAT_UNKNOWN'::"BillingProvider"
  END,
  COALESCE(
    NULLIF(btrim(legacy."revenueCatOriginalTransactionId"), ''),
    'legacy:' || legacy."id"
  ),
  NULLIF(btrim(legacy."revenueCatOriginalTransactionId"), ''),
  legacy."revenueCatStore",
  legacy."revenueCatEnvironment",
  legacy."status",
  legacy."plan",
  legacy."currentPeriodStart",
  legacy."currentPeriodEnd",
  legacy."trialStart",
  legacy."trialEnd",
  legacy."cancelAtPeriodEnd",
  legacy."canceledAt",
  legacy."updatedAt",
  1,
  legacy."id",
  legacy."createdAt",
  legacy."updatedAt"
FROM "subscriptions" AS legacy
JOIN "billing_subjects" AS subject ON subject."userId" = legacy."userId"
ON CONFLICT ("legacySubscriptionId") DO NOTHING;

-- A historical trial date is sufficient evidence that the lifetime trial was
-- consumed. The user-scoped unique key makes reruns idempotent.
INSERT INTO "premium_trial_uses" (
  "id",
  "billingSubjectId",
  "firstProvider",
  "startedAt",
  "sourceSubscriptionId",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  provider_row."billingSubjectId",
  provider_row."provider",
  COALESCE(provider_row."trialStart", provider_row."trialEnd"),
  provider_row."providerSubscriptionId",
  CURRENT_TIMESTAMP
FROM "billing_subscriptions" AS provider_row
WHERE provider_row."trialStart" IS NOT NULL OR provider_row."trialEnd" IS NOT NULL
ON CONFLICT ("billingSubjectId") DO NOTHING;

-- Current backend access rules are ACTIVE, TRIALING, and PAST_DUE. Access is
-- bounded by currentPeriodEnd. Equal boundaries use the documented stable
-- precedence STRIPE, APP_STORE, PLAY_STORE, then REVENUECAT_UNKNOWN.
INSERT INTO "premium_entitlements" (
  "id",
  "billingSubjectId",
  "active",
  "inGracePeriod",
  "validUntil",
  "managementProvider",
  "sourceProvider",
  "status",
  "plan",
  "trialEnd",
  "currentPeriodEnd",
  "cancelAtPeriodEnd",
  "version",
  "derivedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  subject."id",
  live_user."compedAccess" OR winner."id" IS NOT NULL,
  NOT live_user."compedAccess"
    AND COALESCE(winner."status" = 'PAST_DUE'::"SubscriptionStatus", false),
  CASE WHEN live_user."compedAccess" THEN NULL ELSE winner."currentPeriodEnd" END,
  CASE
    WHEN live_user."compedAccess" OR winner."provider" IS NULL
      THEN 'NONE'::"BillingManagementProvider"
    WHEN winner."provider" = 'STRIPE'::"BillingProvider"
      THEN 'STRIPE'::"BillingManagementProvider"
    WHEN winner."provider" = 'APP_STORE'::"BillingProvider"
      THEN 'APP_STORE'::"BillingManagementProvider"
    WHEN winner."provider" = 'PLAY_STORE'::"BillingProvider"
      THEN 'PLAY_STORE'::"BillingManagementProvider"
    ELSE 'REVENUECAT_UNKNOWN'::"BillingManagementProvider"
  END,
  CASE WHEN live_user."compedAccess" THEN NULL ELSE winner."provider" END,
  CASE WHEN live_user."compedAccess" THEN NULL ELSE winner."status" END,
  CASE WHEN live_user."compedAccess" THEN NULL ELSE winner."plan" END,
  CASE WHEN live_user."compedAccess" THEN NULL ELSE winner."trialEnd" END,
  CASE WHEN live_user."compedAccess" THEN NULL ELSE winner."currentPeriodEnd" END,
  CASE WHEN live_user."compedAccess" THEN false ELSE COALESCE(winner."cancelAtPeriodEnd", false) END,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "billing_subjects" AS subject
JOIN "users" AS live_user ON live_user."id" = subject."userId"
LEFT JOIN LATERAL (
  SELECT provider_row.*
  FROM "billing_subscriptions" AS provider_row
  WHERE provider_row."billingSubjectId" = subject."id"
    AND provider_row."status" IN (
      'ACTIVE'::"SubscriptionStatus",
      'TRIALING'::"SubscriptionStatus",
      'PAST_DUE'::"SubscriptionStatus"
    )
    AND provider_row."currentPeriodEnd" > CURRENT_TIMESTAMP
  ORDER BY
    provider_row."currentPeriodEnd" DESC,
    CASE provider_row."provider"
      WHEN 'STRIPE'::"BillingProvider" THEN 4
      WHEN 'APP_STORE'::"BillingProvider" THEN 3
      WHEN 'PLAY_STORE'::"BillingProvider" THEN 2
      ELSE 1
    END DESC,
    provider_row."sourceUpdatedAt" DESC,
    provider_row."id" ASC
  LIMIT 1
) AS winner ON true
ON CONFLICT ("billingSubjectId") DO NOTHING;

COMMIT;
