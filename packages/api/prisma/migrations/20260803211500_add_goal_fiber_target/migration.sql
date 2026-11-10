ALTER TABLE "goals" ADD COLUMN "dailyFiberG" DOUBLE PRECISION;

UPDATE "goals"
SET "dailyFiberG" = ROUND(("dailyCalories" * 14.0 / 1000.0)::numeric)::double precision,
    "algorithmVersion" = 'mifflin-st-jeor-v3-fiber-target';

ALTER TABLE "goals" ALTER COLUMN "dailyFiberG" SET NOT NULL;
ALTER TABLE "goals"
ALTER COLUMN "algorithmVersion" SET DEFAULT 'mifflin-st-jeor-v3-fiber-target';

UPDATE "onboarding_submissions" AS submission
SET "resultJson" = jsonb_set(
  jsonb_set(
    submission."resultJson",
    '{goal,fiberG}',
    to_jsonb(goal."dailyFiberG"),
    true
  ),
  '{calculations,fiberG}',
  to_jsonb(goal."dailyFiberG"),
  true
)
FROM "goals" AS goal
WHERE submission."userId" = goal."userId"
  AND submission."status" = 'COMPLETED'
  AND submission."resultJson" IS NOT NULL
  AND goal."isActive" = true;
