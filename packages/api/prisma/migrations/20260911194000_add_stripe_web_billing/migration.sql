BEGIN;

ALTER TYPE "BillingProvider" RENAME TO "BillingProvider_old";
CREATE TYPE "BillingProvider" AS ENUM ('APP_STORE', 'PLAY_STORE', 'REVENUECAT_UNKNOWN', 'STRIPE');
ALTER TABLE "billing_subscriptions"
  ALTER COLUMN "provider" TYPE "BillingProvider"
  USING "provider"::text::"BillingProvider";
ALTER TABLE "premium_entitlements"
  ALTER COLUMN "sourceProvider" TYPE "BillingProvider"
  USING "sourceProvider"::text::"BillingProvider";
ALTER TABLE "premium_trial_uses"
  ALTER COLUMN "firstProvider" TYPE "BillingProvider"
  USING "firstProvider"::text::"BillingProvider";
DROP TYPE "BillingProvider_old";

ALTER TYPE "BillingManagementProvider" RENAME TO "BillingManagementProvider_old";
CREATE TYPE "BillingManagementProvider" AS ENUM ('APP_STORE', 'PLAY_STORE', 'REVENUECAT_UNKNOWN', 'STRIPE', 'NONE');
ALTER TABLE "premium_entitlements"
  ALTER COLUMN "managementProvider" DROP DEFAULT,
  DROP CONSTRAINT "premium_entitlements_inactive_state";
ALTER TABLE "premium_entitlements"
  ALTER COLUMN "managementProvider" TYPE "BillingManagementProvider"
  USING "managementProvider"::text::"BillingManagementProvider";
ALTER TABLE "premium_entitlements"
  ALTER COLUMN "managementProvider" SET DEFAULT 'NONE';
ALTER TABLE "premium_entitlements"
  ADD CONSTRAINT "premium_entitlements_inactive_state"
  CHECK ((active OR ((NOT "inGracePeriod") AND ("validUntil" IS NULL) AND ("managementProvider" = 'NONE'::"BillingManagementProvider") AND ("sourceProvider" IS NULL) AND (status IS NULL) AND (plan IS NULL) AND ("trialEnd" IS NULL) AND ("currentPeriodEnd" IS NULL) AND (NOT "cancelAtPeriodEnd"))));
DROP TYPE "BillingManagementProvider_old";

CREATE TABLE "stripe_checkout_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billingSubjectId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "plan" "PlanType" NOT NULL,
  "priceId" TEXT NOT NULL,
  "checkoutSessionId" TEXT,
  "stripeCustomerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_checkout_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stripe_checkout_attempts_billingSubjectId_fkey"
    FOREIGN KEY ("billingSubjectId") REFERENCES "billing_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "stripe_checkout_attempts_checkoutSessionId_key"
  ON "stripe_checkout_attempts"("checkoutSessionId");
CREATE UNIQUE INDEX "stripe_checkout_attempts_billingSubjectId_idempotencyKey_key"
  ON "stripe_checkout_attempts"("billingSubjectId", "idempotencyKey");
CREATE INDEX "stripe_checkout_attempts_billingSubjectId_createdAt_idx"
  ON "stripe_checkout_attempts"("billingSubjectId", "createdAt");

CREATE TABLE "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stripe_webhook_events_status_createdAt_idx"
  ON "stripe_webhook_events"("status", "createdAt");

COMMIT;
