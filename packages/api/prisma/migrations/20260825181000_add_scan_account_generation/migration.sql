ALTER TABLE "users"
ADD COLUMN "scanAccountGeneration" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "scan_account_cleanup_tasks"
ADD COLUMN "accountGeneration" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
ADD CONSTRAINT "users_scanAccountGeneration_positive"
CHECK ("scanAccountGeneration" > 0);

ALTER TABLE "scan_account_cleanup_tasks"
ADD CONSTRAINT "scan_account_cleanup_tasks_accountGeneration_positive"
CHECK ("accountGeneration" > 0);
