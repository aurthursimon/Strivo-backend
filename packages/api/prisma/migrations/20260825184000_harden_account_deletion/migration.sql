BEGIN;

-- Google subjects were not retained by releases before this migration. Refuse
-- to cross the compatibility boundary while any non-Apple task may still have
-- been created without an identity fence. Stop the old API and drain first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "scan_account_cleanup_tasks"
    WHERE "status" <> 'COMPLETED'::"ScanAccountCleanupStatus"
      AND NOT "appleRevocationRequired"
  ) THEN
    RAISE EXCEPTION
      'drain non-Apple account cleanup tasks before migration 20260825184000';
  END IF;
END
$$;

ALTER TABLE "apple_credentials"
ADD COLUMN "tokenKeyId" TEXT;

ALTER TABLE "scan_account_cleanup_tasks"
ADD COLUMN "appleTokenKeyId" TEXT;

-- Completed rows created by the first scan-only outbox version already had
-- RevenueCat erased synchronously. Preserve that migration history as durable
-- checkpoints before enforcing the stronger completion invariant.
UPDATE "scan_account_cleanup_tasks"
SET
  "subjectId" = NULL,
  "providerSubjectHash" = NULL,
  "appleTokenCiphertext" = NULL,
  "appleTokenIv" = NULL,
  "appleTokenTag" = NULL,
  "appleTokenType" = NULL,
  "appleTokenKeyId" = NULL,
  "scanDeletedAt" = COALESCE("scanDeletedAt", "completedAt", "updatedAt", "createdAt"),
  "revenueCatDeletedAt" = COALESCE(
    "revenueCatDeletedAt",
    "completedAt",
    "updatedAt",
    "createdAt"
  ),
  "completedAt" = COALESCE("completedAt", "updatedAt", "createdAt")
WHERE "status" = 'COMPLETED'::"ScanAccountCleanupStatus"
  AND NOT "appleRevocationRequired";

ALTER TABLE "scan_account_cleanup_tasks"
DROP CONSTRAINT "scan_account_cleanup_tasks_apple_credential_state";

ALTER TABLE "users"
ADD CONSTRAINT "users_social_provider_id_present"
CHECK (
  "provider" NOT IN ('APPLE'::"AuthProvider", 'GOOGLE'::"AuthProvider")
  OR ("providerId" IS NOT NULL AND length(btrim("providerId")) > 0)
);

ALTER TABLE "scan_account_cleanup_tasks"
ADD CONSTRAINT "scan_account_cleanup_tasks_processable_subject"
CHECK (
  (
    "status" = 'COMPLETED'::"ScanAccountCleanupStatus"
    AND "subjectId" IS NULL
    AND "providerSubjectHash" IS NULL
    AND "completedAt" IS NOT NULL
    AND "scanDeletedAt" IS NOT NULL
    AND "revenueCatDeletedAt" IS NOT NULL
    AND (NOT "appleRevocationRequired" OR "appleRevokedAt" IS NOT NULL)
  )
  OR (
    "status" <> 'COMPLETED'::"ScanAccountCleanupStatus"
    AND "subjectId" IS NOT NULL
    AND length("subjectId") > 0
    AND "completedAt" IS NULL
    AND (NOT "appleRevocationRequired" OR "providerSubjectHash" IS NOT NULL)
  )
),
ADD CONSTRAINT "scan_account_cleanup_tasks_hash_format"
CHECK (
  "subjectHash" ~ '^[0-9a-f]{64}$'
  AND (
    "providerSubjectHash" IS NULL
    OR "providerSubjectHash" ~ '^[0-9a-f]{64}$'
  )
),
ADD CONSTRAINT "scan_account_cleanup_tasks_attempts_nonnegative"
CHECK ("attempts" >= 0),
ADD CONSTRAINT "scan_account_cleanup_tasks_lease_state"
CHECK (
  (
    "status" = 'PROCESSING'::"ScanAccountCleanupStatus"
    AND "leaseToken" IS NOT NULL
    AND "leaseExpiresAt" IS NOT NULL
    AND "lastAttemptAt" IS NOT NULL
  )
  OR (
    "status" <> 'PROCESSING'::"ScanAccountCleanupStatus"
    AND "leaseToken" IS NULL
    AND "leaseExpiresAt" IS NULL
  )
),
ADD CONSTRAINT "scan_account_cleanup_tasks_apple_credential_state"
CHECK (
  (
    NOT "appleRevocationRequired"
    AND "appleRevokedAt" IS NULL
    AND "appleTokenCiphertext" IS NULL
    AND "appleTokenIv" IS NULL
    AND "appleTokenTag" IS NULL
    AND "appleTokenType" IS NULL
    AND "appleTokenKeyId" IS NULL
  )
  OR (
    "appleRevocationRequired"
    AND (
      (
        "appleRevokedAt" IS NULL
        AND "appleTokenCiphertext" IS NOT NULL
        AND length("appleTokenCiphertext") > 0
        AND "appleTokenIv" IS NOT NULL
        AND length("appleTokenIv") > 0
        AND "appleTokenTag" IS NOT NULL
        AND length("appleTokenTag") > 0
        AND "appleTokenType" IN ('refresh_token', 'access_token')
      )
      OR (
        "appleRevokedAt" IS NOT NULL
        AND "appleTokenCiphertext" IS NULL
        AND "appleTokenIv" IS NULL
        AND "appleTokenTag" IS NULL
        AND "appleTokenType" IS NULL
        AND "appleTokenKeyId" IS NULL
      )
    )
  )
);

CREATE UNIQUE INDEX "scan_account_cleanup_tasks_subjectHash_key"
ON "scan_account_cleanup_tasks"("subjectHash");

DROP INDEX "scan_account_cleanup_tasks_providerSubjectHash_status_idx";
CREATE UNIQUE INDEX "scan_account_cleanup_tasks_providerSubjectHash_key"
ON "scan_account_cleanup_tasks"("providerSubjectHash");

-- Webhook ids remain as deduplication receipts, but user ids and historical
-- error payloads are removed so account deletion cannot leave local PII here.
UPDATE "revenuecat_webhook_events" SET "error" = NULL;
DROP INDEX IF EXISTS "revenuecat_webhook_events_appUserId_createdAt_idx";
ALTER TABLE "revenuecat_webhook_events" DROP COLUMN "appUserId";

COMMIT;
