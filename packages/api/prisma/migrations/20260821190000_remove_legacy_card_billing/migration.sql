DROP TABLE "stripe_webhook_events";

ALTER TABLE "subscriptions"
  DROP COLUMN "billingProvider",
  DROP COLUMN "stripePriceId",
  DROP COLUMN "stripeSubscriptionId";

ALTER TABLE "users"
  DROP COLUMN "stripeCustomerId";

DROP TYPE "BillingProvider";
ALTER TYPE "StripeWebhookEventStatus" RENAME TO "WebhookEventStatus";
