ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "guestInstallationHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_guestInstallationHash_key"
ON "users"("guestInstallationHash");
