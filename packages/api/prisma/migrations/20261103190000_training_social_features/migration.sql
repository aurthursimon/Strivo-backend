CREATE TABLE "training_workouts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workoutId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "durationSec" INTEGER NOT NULL,
  "completedSets" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_workouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "training_workouts_userId_workoutId_key" ON "training_workouts"("userId", "workoutId");
CREATE INDEX "training_workouts_finishedAt_userId_idx" ON "training_workouts"("finishedAt", "userId");
CREATE TABLE "training_challenge_entries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_challenge_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_challenge_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "training_challenge_entries_userId_challengeId_weekStart_key" ON "training_challenge_entries"("userId", "challengeId", "weekStart");

ALTER TABLE "community_stories" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "community_stories_userId_clientRequestId_key" ON "community_stories"("userId", "clientRequestId");
