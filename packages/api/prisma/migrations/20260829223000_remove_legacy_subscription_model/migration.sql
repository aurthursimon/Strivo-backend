BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "subscriptions" AS legacy
    LEFT JOIN "billing_subscriptions" AS canonical
      ON canonical."legacySubscriptionId" = legacy."id"
    WHERE canonical."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy subscription backfill is incomplete';
  END IF;
END
$$;

DROP TABLE "subscriptions";

COMMIT;
