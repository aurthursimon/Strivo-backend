DROP TABLE IF EXISTS "outbox_events";
DROP TYPE IF EXISTS "OutboxEventStatus";

UPDATE "scan_jobs"
SET "status" = 'CANCELED', "error" = NULL
WHERE "status" IN ('PENDING_UPLOAD', 'QUEUED', 'PROCESSING', 'FAILED_RETRYABLE');

ALTER TABLE "scan_jobs"
  DROP COLUMN IF EXISTS "s3Bucket",
  DROP COLUMN IF EXISTS "s3Key";
