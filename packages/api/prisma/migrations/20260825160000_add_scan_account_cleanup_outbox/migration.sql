CREATE TYPE "ScanAccountCleanupStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'COMPLETED'
);

CREATE TABLE "scan_account_cleanup_tasks" (
  "id" UUID NOT NULL,
  "subjectId" TEXT,
  "subjectHash" CHAR(64) NOT NULL,
  "status" "ScanAccountCleanupStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_account_cleanup_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scan_account_cleanup_tasks_status_nextAttemptAt_leaseExpiresAt_idx"
  ON "scan_account_cleanup_tasks"("status", "nextAttemptAt", "leaseExpiresAt");
CREATE INDEX "scan_account_cleanup_tasks_completedAt_idx"
  ON "scan_account_cleanup_tasks"("completedAt");

COMMENT ON TABLE "scan_account_cleanup_tasks" IS
  'Durable external cleanup outbox. Intentionally has no foreign key to users.';
