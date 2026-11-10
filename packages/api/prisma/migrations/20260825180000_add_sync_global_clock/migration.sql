CREATE TABLE "sync_state" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "currentRevision" BIGINT NOT NULL DEFAULT 1,
  "retentionFloor" BIGINT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sync_state_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "sync_state_revision_check" CHECK (
    "currentRevision" >= 1 AND
    "retentionFloor" >= 1 AND
    "retentionFloor" <= "currentRevision"
  )
);

INSERT INTO "sync_state" ("id", "currentRevision", "retentionFloor", "updatedAt")
SELECT 1, GREATEST(COALESCE(MAX("revision"), 1), 1), 1, CURRENT_TIMESTAMP
FROM "sync_changes";

ALTER TABLE "sync_changes" ALTER COLUMN "revision" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "sync_changes_revision_seq";

CREATE OR REPLACE FUNCTION "allocate_sync_revision"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_revision BIGINT;
BEGIN
  UPDATE "sync_state"
  SET
    "currentRevision" = "currentRevision" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = 1
  RETURNING "currentRevision" INTO next_revision;

  IF next_revision IS NULL THEN
    RAISE EXCEPTION 'sync_state singleton is missing';
  END IF;

  NEW."revision" = next_revision;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "sync_changes_allocate_revision"
BEFORE INSERT ON "sync_changes"
FOR EACH ROW
EXECUTE FUNCTION "allocate_sync_revision"();
