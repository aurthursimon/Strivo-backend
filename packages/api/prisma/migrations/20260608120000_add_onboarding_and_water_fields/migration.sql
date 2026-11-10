-- CreateEnum
CREATE TYPE "GoalSpeed" AS ENUM ('SLOW', 'MODERATE', 'FAST');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('OMNIVORE', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'KETO', 'OTHER');

-- AlterTable users: onboarding + preference fields
ALTER TABLE "users" ADD COLUMN "dietType" "DietType",
ADD COLUMN "exerciseCalories" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "rolloverCalories" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notificationsOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable users: default locale -> pt
ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'pt';

-- AlterTable goals: water goal + goal speed
ALTER TABLE "goals" ADD COLUMN "waterMl" INTEGER,
ADD COLUMN "goalSpeed" "GoalSpeed";

-- Backfill: mark onboarding complete for users who already have an active goal
UPDATE "users" u SET "onboardingCompleted" = true
WHERE EXISTS (
  SELECT 1 FROM "goals" g WHERE g."userId" = u."id" AND g."isActive" = true
);
