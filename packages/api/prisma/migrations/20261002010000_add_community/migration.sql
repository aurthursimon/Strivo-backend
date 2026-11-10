-- CreateEnum
CREATE TYPE "CommunityReportTargetType" AS ENUM ('POST', 'COMMENT', 'USER');

-- CreateTable
CREATE TABLE "community_posts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_likes" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reports" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" "CommunityReportTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_posts_createdAt_idx" ON "community_posts" ("createdAt");
CREATE INDEX "community_posts_userId_idx" ON "community_posts" ("userId");

CREATE INDEX "community_comments_postId_createdAt_idx"
ON "community_comments" ("postId", "createdAt");
CREATE INDEX "community_comments_userId_idx" ON "community_comments" ("userId");

CREATE UNIQUE INDEX "community_likes_postId_userId_key"
ON "community_likes" ("postId", "userId");
CREATE INDEX "community_likes_userId_idx" ON "community_likes" ("userId");

CREATE INDEX "community_reports_targetType_targetId_idx"
ON "community_reports" ("targetType", "targetId");
CREATE INDEX "community_reports_reporterId_idx" ON "community_reports" ("reporterId");

ALTER TABLE "community_posts"
ADD CONSTRAINT "community_posts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_comments"
ADD CONSTRAINT "community_comments_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_comments"
ADD CONSTRAINT "community_comments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_likes"
ADD CONSTRAINT "community_likes_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_likes"
ADD CONSTRAINT "community_likes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_reports"
ADD CONSTRAINT "community_reports_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
