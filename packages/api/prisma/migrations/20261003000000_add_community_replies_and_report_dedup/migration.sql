-- One level of replies on community comments
ALTER TABLE "community_comments" ADD COLUMN "parentCommentId" TEXT;

CREATE INDEX "community_comments_parentCommentId_idx"
ON "community_comments" ("parentCommentId");

ALTER TABLE "community_comments"
ADD CONSTRAINT "community_comments_parentCommentId_fkey"
FOREIGN KEY ("parentCommentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deduplicate any existing reports before enforcing one-report-per-user-per-target,
-- keeping the earliest row for each (reporterId, targetType, targetId) group.
DELETE FROM "community_reports" a USING "community_reports" b
WHERE a."reporterId" = b."reporterId"
  AND a."targetType" = b."targetType"
  AND a."targetId" = b."targetId"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

CREATE UNIQUE INDEX "community_reports_reporterId_targetType_targetId_key"
ON "community_reports" ("reporterId", "targetType", "targetId");
