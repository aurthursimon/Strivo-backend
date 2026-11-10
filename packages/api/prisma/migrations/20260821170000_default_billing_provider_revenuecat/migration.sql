-- New subscriptions are fulfilled by Apple through RevenueCat. Keep the
-- STRIPE enum value and legacy columns so existing subscribers can finish or
-- cancel their current billing lifecycle without losing access.
ALTER TABLE "subscriptions"
ALTER COLUMN "billingProvider" SET DEFAULT 'REVENUECAT';
