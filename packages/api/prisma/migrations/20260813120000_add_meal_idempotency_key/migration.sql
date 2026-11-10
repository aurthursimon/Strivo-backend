ALTER TABLE "meals" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "meals_userId_idempotencyKey_key"
ON "meals"("userId", "idempotencyKey");
