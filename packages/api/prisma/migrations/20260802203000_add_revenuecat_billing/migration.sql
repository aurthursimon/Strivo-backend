CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'REVENUECAT');

ALTER TYPE "AuthProvider" ADD VALUE IF NOT EXISTS 'GUEST' BEFORE 'EMAIL';

ALTER TABLE "users"
  ADD COLUMN "guestInstallationHash" TEXT,
  ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "users_guestInstallationHash_key"
  ON "users"("guestInstallationHash");
CREATE UNIQUE INDEX "users_provider_providerId_key"
  ON "users"("provider", "providerId");

ALTER TABLE "subscriptions"
  ADD COLUMN "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN "revenueCatProductId" TEXT,
  ADD COLUMN "revenueCatOriginalAppUserId" TEXT,
  ADD COLUMN "revenueCatOriginalTransactionId" TEXT,
  ADD COLUMN "revenueCatStore" TEXT,
  ADD COLUMN "revenueCatEnvironment" TEXT,
  ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL,
  ALTER COLUMN "stripePriceId" DROP NOT NULL;

CREATE UNIQUE INDEX "subscriptions_revenueCatOriginalTransactionId_key"
  ON "subscriptions"("revenueCatOriginalTransactionId");
CREATE INDEX "subscriptions_billingProvider_status_idx"
  ON "subscriptions"("billingProvider", "status");
CREATE INDEX "subscriptions_revenueCatOriginalAppUserId_idx"
  ON "subscriptions"("revenueCatOriginalAppUserId");

CREATE TABLE "revenuecat_webhook_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "appUserId" TEXT,
  "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "revenuecat_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "revenuecat_webhook_events_status_createdAt_idx"
  ON "revenuecat_webhook_events"("status", "createdAt");
CREATE INDEX "revenuecat_webhook_events_appUserId_createdAt_idx"
  ON "revenuecat_webhook_events"("appUserId", "createdAt");
