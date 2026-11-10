ALTER TABLE "scan_account_cleanup_tasks"
ADD COLUMN "appleRevocationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "providerSubjectHash" CHAR(64),
ADD COLUMN "appleTokenCiphertext" TEXT,
ADD COLUMN "appleTokenIv" TEXT,
ADD COLUMN "appleTokenTag" TEXT,
ADD COLUMN "appleTokenType" TEXT,
ADD COLUMN "scanDeletedAt" TIMESTAMP(3),
ADD COLUMN "appleRevokedAt" TIMESTAMP(3),
ADD COLUMN "revenueCatDeletedAt" TIMESTAMP(3);

ALTER TABLE "scan_account_cleanup_tasks"
ADD CONSTRAINT "scan_account_cleanup_tasks_apple_credential_state"
CHECK (
  NOT "appleRevocationRequired"
  OR "status" = 'COMPLETED'::"ScanAccountCleanupStatus"
  OR "appleRevokedAt" IS NOT NULL
  OR (
    "providerSubjectHash" IS NOT NULL
    AND "appleTokenCiphertext" IS NOT NULL
    AND "appleTokenIv" IS NOT NULL
    AND "appleTokenTag" IS NOT NULL
    AND "appleTokenType" IN ('refresh_token', 'access_token')
  )
);

CREATE INDEX "scan_account_cleanup_tasks_providerSubjectHash_status_idx"
ON "scan_account_cleanup_tasks"("providerSubjectHash", "status");

COMMENT ON TABLE "scan_account_cleanup_tasks" IS
  'Durable external account cleanup outbox. Intentionally has no foreign key to users.';
