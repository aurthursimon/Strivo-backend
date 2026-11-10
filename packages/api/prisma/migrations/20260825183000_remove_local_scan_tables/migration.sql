DROP TABLE IF EXISTS "scan_jobs";
DROP TYPE IF EXISTS "ScanJobStatus";
DROP TABLE IF EXISTS "scan_usage";
ALTER TABLE "daily_logs" DROP COLUMN IF EXISTS "scansUsed";
