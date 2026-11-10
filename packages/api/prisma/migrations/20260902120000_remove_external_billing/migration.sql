BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "billing_subscriptions" WHERE "provider" = 'STRIPE'::"BillingProvider"
  ) OR EXISTS (
    SELECT 1 FROM "premium_entitlements" WHERE "sourceProvider" = 'STRIPE'::"BillingProvider"
  ) OR EXISTS (
    SELECT 1 FROM "premium_entitlements"
    WHERE "managementProvider" = 'STRIPE'::"BillingManagementProvider"
  ) OR EXISTS (
    SELECT 1 FROM "premium_trial_uses" WHERE "firstProvider" = 'STRIPE'::"BillingProvider"
  ) THEN
    RAISE EXCEPTION 'External billing records must be migrated before removing their provider';
  END IF;
END
$$;

DROP TABLE "billing_outbox_jobs";
DROP TABLE "google_external_transactions";
DROP TABLE "external_link_launches";
DROP TABLE "checkout_attempts";
DROP TABLE "stripe_webhook_events";

ALTER TYPE "BillingProvider" RENAME TO "BillingProvider_old";
CREATE TYPE "BillingProvider" AS ENUM ('APP_STORE', 'PLAY_STORE', 'REVENUECAT_UNKNOWN');

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

ALTER TABLE "premium_entitlements"
  ALTER COLUMN "managementProvider" DROP DEFAULT;
ALTER TABLE "premium_entitlements"
  DROP CONSTRAINT "premium_entitlements_inactive_state";
ALTER TYPE "BillingManagementProvider" RENAME TO "BillingManagementProvider_old";
CREATE TYPE "BillingManagementProvider" AS ENUM (
  'APP_STORE',
  'PLAY_STORE',
  'REVENUECAT_UNKNOWN',
  'NONE'
);
ALTER TABLE "premium_entitlements"
  ALTER COLUMN "managementProvider" TYPE "BillingManagementProvider"
  USING "managementProvider"::text::"BillingManagementProvider";
ALTER TABLE "premium_entitlements"
  ALTER COLUMN "managementProvider" SET DEFAULT 'NONE';
ALTER TABLE "premium_entitlements"
  ADD CONSTRAINT "premium_entitlements_inactive_state" CHECK (
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
  );
DROP TYPE "BillingManagementProvider_old";

DROP TYPE "CheckoutAttemptState";
DROP TYPE "BillingPlatform";
DROP TYPE "BillingOutboxKind";
DROP TYPE "BillingOutboxState";
DROP TYPE "GoogleExternalTransactionKind";
DROP TYPE "GoogleExternalTransactionState";

COMMIT;
