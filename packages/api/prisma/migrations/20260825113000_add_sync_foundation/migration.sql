CREATE TYPE "SyncMutationStatus" AS ENUM ('PROCESSING', 'APPLIED', 'REJECTED');
CREATE TYPE "SyncChangeAction" AS ENUM ('UPSERT', 'DELETE');

CREATE TABLE "weight_entries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dailyLogId" TEXT NOT NULL,
  "weightKg" DOUBLE PRECISION NOT NULL,
  "clientMutationId" TEXT,
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weight_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_mutations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mutationId" TEXT NOT NULL,
  "installationId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "SyncMutationStatus" NOT NULL DEFAULT 'PROCESSING',
  "resultJson" JSONB,
  "errorCode" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sync_mutations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_bootstrap_sessions" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "snapshotRevision" BIGINT NOT NULL,
  "itemsJson" JSONB NOT NULL,
  "totalItems" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_bootstrap_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_changes" (
  "revision" BIGSERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" "SyncChangeAction" NOT NULL DEFAULT 'UPSERT',
  "version" INTEGER,
  "dataJson" JSONB,
  "mutationId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_changes_pkey" PRIMARY KEY ("revision")
);

-- Revision 1 is the empty-database bootstrap cursor. Real changes start at 2.
ALTER SEQUENCE "sync_changes_revision_seq" RESTART WITH 2;

CREATE UNIQUE INDEX "weight_entries_userId_clientMutationId_key"
  ON "weight_entries"("userId", "clientMutationId");
CREATE INDEX "weight_entries_userId_measuredAt_idx"
  ON "weight_entries"("userId", "measuredAt");
CREATE INDEX "weight_entries_dailyLogId_measuredAt_idx"
  ON "weight_entries"("dailyLogId", "measuredAt");

CREATE UNIQUE INDEX "sync_mutations_userId_mutationId_key"
  ON "sync_mutations"("userId", "mutationId");
CREATE UNIQUE INDEX "sync_mutations_userId_installationId_sequence_key"
  ON "sync_mutations"("userId", "installationId", "sequence");
CREATE INDEX "sync_mutations_userId_sequence_idx"
  ON "sync_mutations"("userId", "sequence");
CREATE INDEX "sync_mutations_userId_createdAt_idx"
  ON "sync_mutations"("userId", "createdAt");

CREATE INDEX "sync_changes_userId_revision_idx"
  ON "sync_changes"("userId", "revision");
CREATE INDEX "sync_changes_createdAt_revision_idx"
  ON "sync_changes"("createdAt", "revision");
CREATE INDEX "sync_bootstrap_sessions_userId_expiresAt_idx"
  ON "sync_bootstrap_sessions"("userId", "expiresAt");
CREATE INDEX "sync_bootstrap_sessions_expiresAt_idx"
  ON "sync_bootstrap_sessions"("expiresAt");

ALTER TABLE "weight_entries"
  ADD CONSTRAINT "weight_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weight_entries"
  ADD CONSTRAINT "weight_entries_dailyLogId_fkey"
  FOREIGN KEY ("dailyLogId") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_mutations"
  ADD CONSTRAINT "sync_mutations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_changes"
  ADD CONSTRAINT "sync_changes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_bootstrap_sessions"
  ADD CONSTRAINT "sync_bootstrap_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "weight_entries" (
  "id",
  "userId",
  "dailyLogId",
  "weightKg",
  "clientMutationId",
  "measuredAt",
  "createdAt"
)
SELECT
  'legacy-weight-' || md5(log."userId" || ':' || log."date"::text),
  log."userId",
  log."id",
  log."weightKg",
  NULL,
  log."date"::timestamp,
  log."createdAt"
FROM "daily_logs" log
WHERE log."weightKg" IS NOT NULL;
