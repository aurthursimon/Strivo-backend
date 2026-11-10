-- Scan now runs in-process (see modules/scan) instead of calling the
-- separate scan-service microservice over a signed-assertion trust boundary.
-- The tables below (added in 20260828120000_add_postgres_scan_runtime purely
-- to provision storage for that microservice's own raw-SQL access - nothing
-- in this package ever queried them through Prisma) are retired along with
-- it, and replaced by a userId-FK'd, cascade-deleting equivalent further
-- down. Nothing here has ever held real scan data: the microservice was
-- never reachable in production.
DROP TABLE "scan_usage_reservations";
DROP TABLE "scan_feedback";
DROP TABLE "scan_jobs";
DROP TABLE "scan_usage";
DROP TABLE "scan_feedback_usage";
DROP TABLE "scan_assertion_replays";
DROP TABLE "scan_account_cleanup_receipts";
DROP TABLE "scan_account_states";
DROP TYPE "ScanRuntimeJobStatus";

-- scanDeletedAt tracked delivery of an account-deletion notice to
-- scan-service; with the cascade-deleting FKs below, scan data now
-- disappears in the same transaction as the User row, so the column (and
-- the delivery step that read it) is retired.
ALTER TABLE "scan_account_cleanup_tasks" DROP COLUMN "scanDeletedAt";

CREATE TYPE "ScanJobStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED_FINAL', 'CANCELED');

CREATE TABLE "scan_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyHash" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "quotaDay" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "status" "ScanJobStatus" NOT NULL,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "result" JSONB,
    "provider" TEXT,
    "imageHash" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scan_jobs_userId_idempotencyHash_key" ON "scan_jobs"("userId", "idempotencyHash");

CREATE INDEX "scan_jobs_userId_quotaDay_status_idx" ON "scan_jobs"("userId", "quotaDay", "status");

CREATE INDEX "scan_jobs_expiresAt_idx" ON "scan_jobs"("expiresAt");

ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "scan_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quotaDay" TEXT NOT NULL,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scan_usage_userId_quotaDay_key" ON "scan_usage"("userId", "quotaDay");

ALTER TABLE "scan_usage" ADD CONSTRAINT "scan_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "scan_feedback" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL,
    "rawItems" JSONB NOT NULL,
    "savedItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scan_feedback_scanId_key" ON "scan_feedback"("scanId");

CREATE INDEX "scan_feedback_userId_createdAt_idx" ON "scan_feedback"("userId", "createdAt");

ALTER TABLE "scan_feedback" ADD CONSTRAINT "scan_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "scan_feedback_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quotaDay" TEXT NOT NULL,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "lastAcceptedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_feedback_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scan_feedback_usage_userId_quotaDay_key" ON "scan_feedback_usage"("userId", "quotaDay");

ALTER TABLE "scan_feedback_usage" ADD CONSTRAINT "scan_feedback_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
