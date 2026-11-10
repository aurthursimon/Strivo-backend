BEGIN;

CREATE TYPE "ScanRuntimeJobStatus" AS ENUM (
  'PROCESSING',
  'COMPLETED',
  'FAILED_FINAL',
  'CANCELED'
);

CREATE TABLE "scan_account_states" (
  "subject_hash" CHAR(64) PRIMARY KEY,
  "deleted_through_generation" INTEGER NOT NULL DEFAULT 0,
  "cleanup_id" UUID,
  "cleanup_account_generation" INTEGER,
  "cleanup_lease_token" UUID,
  "cleanup_lease_expires_at" TIMESTAMP(3),
  "last_completed_cleanup_id" UUID,
  "last_completed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scan_account_states_generation_check"
    CHECK ("deleted_through_generation" >= 0),
  CONSTRAINT "scan_account_states_cleanup_shape_check"
    CHECK (
      ("cleanup_id" IS NULL AND "cleanup_account_generation" IS NULL
        AND "cleanup_lease_token" IS NULL AND "cleanup_lease_expires_at" IS NULL)
      OR
      ("cleanup_id" IS NOT NULL AND "cleanup_account_generation" > 0
        AND "cleanup_lease_token" IS NOT NULL AND "cleanup_lease_expires_at" IS NOT NULL)
    )
);

CREATE TABLE "scan_account_cleanup_receipts" (
  "cleanup_id" UUID PRIMARY KEY,
  "subject_hash" CHAR(64) NOT NULL,
  "account_generation" INTEGER NOT NULL CHECK ("account_generation" > 0),
  "completed_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "scan_account_cleanup_receipts_expiresAt_idx"
  ON "scan_account_cleanup_receipts" ("expires_at");

CREATE TABLE "scan_assertion_replays" (
  "jti_hash" CHAR(64) PRIMARY KEY,
  "consumed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "scan_assertion_replays_expiresAt_idx"
  ON "scan_assertion_replays" ("expires_at");

CREATE TABLE "scan_jobs" (
  "id" VARCHAR(80) PRIMARY KEY,
  "user_id_hash" CHAR(64) NOT NULL,
  "account_generation" INTEGER NOT NULL CHECK ("account_generation" > 0),
  "idempotency_hash" CHAR(64) NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "content_type" VARCHAR(80) NOT NULL,
  "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880),
  "locale" VARCHAR(32) NOT NULL,
  "quota_day" DATE NOT NULL,
  "daily_limit" INTEGER NOT NULL CHECK ("daily_limit" > 0),
  "status" "ScanRuntimeJobStatus" NOT NULL,
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "result" JSONB,
  "provider" VARCHAR(80),
  "image_hash" CHAR(64),
  "error_code" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_jobs_lease_shape_check"
    CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL))
);

CREATE UNIQUE INDEX "scan_jobs_user_generation_idempotency_key"
  ON "scan_jobs" ("user_id_hash", "account_generation", "idempotency_hash");
CREATE INDEX "scan_jobs_user_generation_created_idx"
  ON "scan_jobs" ("user_id_hash", "account_generation", "created_at");
CREATE INDEX "scan_jobs_expiresAt_idx" ON "scan_jobs" ("expires_at");

CREATE TABLE "scan_usage" (
  "user_id_hash" CHAR(64) NOT NULL,
  "account_generation" INTEGER NOT NULL CHECK ("account_generation" > 0),
  "quota_day" DATE NOT NULL,
  "completed" INTEGER NOT NULL DEFAULT 0 CHECK ("completed" >= 0),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id_hash", "account_generation", "quota_day")
);

CREATE INDEX "scan_usage_expiresAt_idx" ON "scan_usage" ("expires_at");

CREATE TABLE "scan_usage_reservations" (
  "scan_id" VARCHAR(80) PRIMARY KEY,
  "user_id_hash" CHAR(64) NOT NULL,
  "account_generation" INTEGER NOT NULL,
  "quota_day" DATE NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_usage_reservations_job_fkey"
    FOREIGN KEY ("scan_id") REFERENCES "scan_jobs" ("id") ON DELETE CASCADE,
  CONSTRAINT "scan_usage_reservations_usage_fkey"
    FOREIGN KEY ("user_id_hash", "account_generation", "quota_day")
    REFERENCES "scan_usage" ("user_id_hash", "account_generation", "quota_day")
    ON DELETE CASCADE
);

CREATE INDEX "scan_usage_reservations_active_idx"
  ON "scan_usage_reservations" ("user_id_hash", "account_generation", "quota_day", "expires_at");

CREATE TABLE "scan_feedback" (
  "scan_id" VARCHAR(80) PRIMARY KEY,
  "user_id_hash" CHAR(64) NOT NULL,
  "account_generation" INTEGER NOT NULL CHECK ("account_generation" > 0),
  "payload_hash" CHAR(64) NOT NULL,
  "edited" BOOLEAN NOT NULL,
  "raw_items" JSONB NOT NULL,
  "saved_items" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_feedback_job_fkey"
    FOREIGN KEY ("scan_id") REFERENCES "scan_jobs" ("id") ON DELETE CASCADE
);

CREATE INDEX "scan_feedback_user_generation_created_idx"
  ON "scan_feedback" ("user_id_hash", "account_generation", "created_at" DESC);
CREATE INDEX "scan_feedback_expiresAt_idx" ON "scan_feedback" ("expires_at");

CREATE TABLE "scan_feedback_usage" (
  "user_id_hash" CHAR(64) NOT NULL,
  "account_generation" INTEGER NOT NULL CHECK ("account_generation" > 0),
  "quota_day" DATE NOT NULL,
  "accepted_count" INTEGER NOT NULL DEFAULT 0 CHECK ("accepted_count" >= 0),
  "last_accepted_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id_hash", "account_generation", "quota_day")
);

CREATE INDEX "scan_feedback_usage_expiresAt_idx"
  ON "scan_feedback_usage" ("expires_at");

COMMIT;
