-- AlterTable: comp/admin entitlement flags (single entitlement mechanism — no magic emails)
ALTER TABLE "users" ADD COLUMN "compedAccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
