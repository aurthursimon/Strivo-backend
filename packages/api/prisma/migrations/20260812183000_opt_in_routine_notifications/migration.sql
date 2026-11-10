-- Routine reminders are opt-in. Dose reminders remain enabled by default when
-- a GLP-1 treatment exists and the user has granted notification permission.
ALTER TABLE "notification_preferences"
  ALTER COLUMN "breakfast" SET DEFAULT false,
  ALTER COLUMN "lunch" SET DEFAULT false,
  ALTER COLUMN "dinner" SET DEFAULT false,
  ALTER COLUMN "water" SET DEFAULT false,
  ALTER COLUMN "streakRisk" SET DEFAULT false;

-- Existing rows are intentionally preserved. The previous schema did not
-- record whether a true value came from a default or from an explicit user
-- choice, so rewriting rows here would irreversibly disable valid opt-ins.
-- The new defaults govern every preference created after this migration.

-- Existing active treatments receive the same default rule as newly-created
-- treatments. The rule is local and still depends on OS permission.
INSERT INTO "glp1_reminder_rules" (
  "id",
  "userId",
  "treatmentId",
  "eventType",
  "offsetMinutes",
  "enabled",
  "channel",
  "timezone",
  "clientMutationId",
  "version",
  "createdAt",
  "updatedAt"
)
SELECT
  'default-dose-' || md5(t."userId" || ':' || t."id"),
  t."userId",
  t."id",
  'dose',
  -120,
  true,
  'local',
  t."timezone",
  'default-dose-reminder:' || t."id",
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "glp1_treatments" t
WHERE
  t."status" = 'ACTIVE'
  AND t."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "glp1_reminder_rules" r
    WHERE
      r."userId" = t."userId"
      AND r."treatmentId" = t."id"
      AND r."eventType" = 'dose'
      AND r."channel" = 'local'
  );
