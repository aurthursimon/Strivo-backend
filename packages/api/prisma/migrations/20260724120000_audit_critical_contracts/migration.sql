CREATE TYPE "OnboardingSubmissionStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "PlanMutationOperation" AS ENUM ('DIET_MEAL_SWAP', 'WORKOUT_EXERCISE_SWAP');

ALTER TABLE "meal_plans"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rulesVersion" TEXT NOT NULL DEFAULT 'catalog-2026-07-24';

ALTER TABLE "workout_plans"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rulesVersion" TEXT NOT NULL DEFAULT 'catalog-2026-07-24';

ALTER TABLE "goals"
ADD COLUMN "algorithmVersion" TEXT NOT NULL DEFAULT 'mifflin-st-jeor-v1',
ADD COLUMN "calculationInputJson" JSONB;

-- Mantem somente o registro ativo mais recente antes de impor a invariavel.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId"
    ORDER BY "generatedAt" DESC, "createdAt" DESC, "id" DESC
  ) AS position
  FROM "meal_plans"
  WHERE "active" = true
)
UPDATE "meal_plans"
SET "active" = false
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId"
    ORDER BY "generatedAt" DESC, "createdAt" DESC, "id" DESC
  ) AS position
  FROM "workout_plans"
  WHERE "active" = true
)
UPDATE "workout_plans"
SET "active" = false
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId"
    ORDER BY "createdAt" DESC, "id" DESC
  ) AS position
  FROM "goals"
  WHERE "isActive" = true
)
UPDATE "goals"
SET "isActive" = false
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "meal_plans_one_active_per_user"
ON "meal_plans" ("userId")
WHERE "active" = true;

CREATE UNIQUE INDEX "workout_plans_one_active_per_user"
ON "workout_plans" ("userId")
WHERE "active" = true;

CREATE UNIQUE INDEX "goals_one_active_per_user"
ON "goals" ("userId")
WHERE "isActive" = true;

CREATE TABLE "oauth_authorization_codes" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientState" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_authorization_codes_codeHash_key"
ON "oauth_authorization_codes" ("codeHash");
CREATE INDEX "oauth_authorization_codes_userId_createdAt_idx"
ON "oauth_authorization_codes" ("userId", "createdAt");
CREATE INDEX "oauth_authorization_codes_expiresAt_idx"
ON "oauth_authorization_codes" ("expiresAt");

CREATE TABLE "onboarding_submissions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "OnboardingSubmissionStatus" NOT NULL DEFAULT 'PROCESSING',
  "resultJson" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_submissions_userId_idempotencyKey_key"
ON "onboarding_submissions" ("userId", "idempotencyKey");
CREATE UNIQUE INDEX "onboarding_submissions_one_processing_per_user"
ON "onboarding_submissions" ("userId")
WHERE "status" = 'PROCESSING';
CREATE INDEX "onboarding_submissions_userId_createdAt_idx"
ON "onboarding_submissions" ("userId", "createdAt");

CREATE TABLE "plan_mutations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "operation" "PlanMutationOperation" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "beforeJson" JSONB,
  "resultJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_mutations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_mutations_userId_operation_idempotencyKey_key"
ON "plan_mutations" ("userId", "operation", "idempotencyKey");
CREATE INDEX "plan_mutations_userId_createdAt_idx"
ON "plan_mutations" ("userId", "createdAt");

ALTER TABLE "oauth_authorization_codes"
ADD CONSTRAINT "oauth_authorization_codes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onboarding_submissions"
ADD CONSTRAINT "onboarding_submissions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_mutations"
ADD CONSTRAINT "plan_mutations_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
