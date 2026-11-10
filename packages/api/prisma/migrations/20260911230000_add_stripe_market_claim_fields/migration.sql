ALTER TABLE "stripe_checkout_attempts"
  ADD COLUMN "market" TEXT NOT NULL DEFAULT 'US',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "claimTokenHash" TEXT,
  ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "stripe_checkout_attempts_claimTokenHash_key"
  ON "stripe_checkout_attempts"("claimTokenHash");

ALTER TABLE "billing_subscriptions"
  ADD COLUMN "providerPriceId" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "market" TEXT,
  ADD COLUMN "amount" INTEGER,
  ADD COLUMN "interval" TEXT;

ALTER TABLE "stripe_checkout_attempts"
  ALTER COLUMN "market" DROP DEFAULT,
  ALTER COLUMN "currency" DROP DEFAULT;
