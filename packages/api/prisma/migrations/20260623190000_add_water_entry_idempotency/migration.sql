ALTER TABLE "water_entries" ADD COLUMN "userId" TEXT;
ALTER TABLE "water_entries" ADD COLUMN "clientMutationId" TEXT;

UPDATE "water_entries" AS we
SET "userId" = dl."userId"
FROM "daily_logs" AS dl
WHERE we."dailyLogId" = dl."id";

ALTER TABLE "water_entries" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "water_entries"
ADD CONSTRAINT "water_entries_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "water_entries_userId_idx" ON "water_entries"("userId");
CREATE UNIQUE INDEX "water_entries_userId_clientMutationId_key"
ON "water_entries"("userId", "clientMutationId");
