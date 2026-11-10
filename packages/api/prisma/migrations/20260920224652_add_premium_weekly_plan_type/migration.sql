-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'PREMIUM_WEEKLY';

-- DropForeignKey
ALTER TABLE "scan_feedback" DROP CONSTRAINT "scan_feedback_job_fkey";

-- DropForeignKey
ALTER TABLE "scan_usage_reservations" DROP CONSTRAINT "scan_usage_reservations_job_fkey";

-- DropForeignKey
ALTER TABLE "scan_usage_reservations" DROP CONSTRAINT "scan_usage_reservations_usage_fkey";

-- DropIndex
DROP INDEX "scan_feedback_user_generation_created_idx";

-- AlterTable
ALTER TABLE "billing_subjects" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "billing_subscriptions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "glp1_dose_events" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "glp1_injection_site_states" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "glp1_reminder_rules" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "glp1_symptom_events" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "glp1_treatments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "premium_entitlements" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "premium_trial_uses" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stripe_checkout_attempts" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stripe_webhook_events" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sync_state" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "scan_feedback_user_id_hash_account_generation_created_at_idx" ON "scan_feedback"("user_id_hash", "account_generation", "created_at");

-- RenameIndex
ALTER INDEX "billing_subscriptions_billingSubjectId_status_currentPeriodEnd_" RENAME TO "billing_subscriptions_billingSubjectId_status_currentPeriod_idx";

-- RenameIndex
ALTER INDEX "billing_subscriptions_provider_providerOriginalTransactionId_id" RENAME TO "billing_subscriptions_provider_providerOriginalTransactionI_idx";

-- RenameIndex
ALTER INDEX "glp1_reminder_rules_userId_treatmentId_eventType_offsetMinutes_" RENAME TO "glp1_reminder_rules_userId_treatmentId_eventType_offsetMinu_key";

-- RenameIndex
ALTER INDEX "scan_account_cleanup_receipts_expiresAt_idx" RENAME TO "scan_account_cleanup_receipts_expires_at_idx";

-- RenameIndex
ALTER INDEX "scan_account_cleanup_tasks_status_nextAttemptAt_leaseExpiresAt_" RENAME TO "scan_account_cleanup_tasks_status_nextAttemptAt_leaseExpire_idx";

-- RenameIndex
ALTER INDEX "scan_assertion_replays_expiresAt_idx" RENAME TO "scan_assertion_replays_expires_at_idx";

-- RenameIndex
ALTER INDEX "scan_feedback_expiresAt_idx" RENAME TO "scan_feedback_expires_at_idx";

-- RenameIndex
ALTER INDEX "scan_feedback_usage_expiresAt_idx" RENAME TO "scan_feedback_usage_expires_at_idx";

-- RenameIndex
ALTER INDEX "scan_jobs_expiresAt_idx" RENAME TO "scan_jobs_expires_at_idx";

-- RenameIndex
ALTER INDEX "scan_jobs_user_generation_created_idx" RENAME TO "scan_jobs_user_id_hash_account_generation_created_at_idx";

-- RenameIndex
ALTER INDEX "scan_jobs_user_generation_idempotency_key" RENAME TO "scan_jobs_user_id_hash_account_generation_idempotency_hash_key";

-- RenameIndex
ALTER INDEX "scan_usage_expiresAt_idx" RENAME TO "scan_usage_expires_at_idx";

-- RenameIndex
ALTER INDEX "scan_usage_reservations_active_idx" RENAME TO "scan_usage_reservations_user_id_hash_account_generation_quo_idx";
