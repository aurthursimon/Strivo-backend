ALTER TABLE "workout_profiles"
  ADD COLUMN "daysOfWeekJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "location" TEXT NOT NULL DEFAULT 'GYM',
  ADD COLUMN "splitPreference" TEXT NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "goal" TEXT NOT NULL DEFAULT 'GENERAL_FITNESS',
  ADD COLUMN "availableEquipmentJson" JSONB NOT NULL DEFAULT '[]';

UPDATE "workout_profiles"
SET "daysOfWeekJson" = CASE "daysPerWeek"
  WHEN 1 THEN '[1]'::jsonb
  WHEN 2 THEN '[1,4]'::jsonb
  WHEN 3 THEN '[1,3,5]'::jsonb
  WHEN 4 THEN '[1,2,4,5]'::jsonb
  WHEN 5 THEN '[1,2,3,5,6]'::jsonb
  WHEN 6 THEN '[1,2,3,4,5,6]'::jsonb
  ELSE '[0,1,2,3,4,5,6]'::jsonb
END
WHERE "daysOfWeekJson" = '[]'::jsonb;

UPDATE "workout_profiles"
SET "location" = CASE
  WHEN lower("equipment") LIKE '%casa%'
    OR lower("equipment") LIKE '%bodyweight%'
    OR lower("equipment") LIKE '%peso corporal%'
    OR lower("equipment") LIKE '%nenhum%'
  THEN 'HOME'
  ELSE 'GYM'
END;

ALTER TABLE "workout_plans"
  ALTER COLUMN "rulesVersion" SET DEFAULT 'catalog-2026-08-12-personalized';
