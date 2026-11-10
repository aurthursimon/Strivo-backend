-- AlterTable
ALTER TABLE "community_posts" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "videoThumbnailUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "workoutMeta" JSONB;

-- CreateTable
CREATE TABLE "community_friendships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_chat_conversations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_chat_participants" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "direct_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Certified Fitness Trainer',
    "bio" TEXT NOT NULL DEFAULT '',
    "specialties" JSONB NOT NULL DEFAULT '[]',
    "certifications" JSONB NOT NULL DEFAULT '[]',
    "yearsExperience" INTEGER NOT NULL DEFAULT 1,
    "traineesCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "instagram" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_exercises" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STRENGTH',
    "primaryMuscles" JSONB NOT NULL DEFAULT '[]',
    "equipment" TEXT NOT NULL DEFAULT 'BODYWEIGHT',
    "instructions" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_programs" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT 'WEIGHT_LOSS',
    "difficulty" TEXT NOT NULL DEFAULT 'INTERMEDIATE',
    "durationWeeks" INTEGER NOT NULL DEFAULT 4,
    "coverImageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "daysJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_program_enrollments" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "completedDays" JSONB NOT NULL DEFAULT '[]',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_program_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_stories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
    "caption" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_story_views" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_story_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_story_likes" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_story_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_friendships_userId_idx" ON "community_friendships"("userId");

-- CreateIndex
CREATE INDEX "community_friendships_friendId_idx" ON "community_friendships"("friendId");

-- CreateIndex
CREATE UNIQUE INDEX "community_friendships_userId_friendId_key" ON "community_friendships"("userId", "friendId");

-- CreateIndex
CREATE INDEX "direct_chat_participants_userId_idx" ON "direct_chat_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_chat_participants_conversationId_userId_key" ON "direct_chat_participants"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "direct_chat_messages_conversationId_createdAt_idx" ON "direct_chat_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "direct_chat_messages_senderId_idx" ON "direct_chat_messages"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_userId_key" ON "trainer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_handle_key" ON "trainer_profiles"("handle");

-- CreateIndex
CREATE INDEX "trainer_exercises_trainerId_idx" ON "trainer_exercises"("trainerId");

-- CreateIndex
CREATE INDEX "trainer_programs_trainerId_idx" ON "trainer_programs"("trainerId");

-- CreateIndex
CREATE INDEX "trainer_programs_goal_idx" ON "trainer_programs"("goal");

-- CreateIndex
CREATE INDEX "trainer_program_enrollments_userId_idx" ON "trainer_program_enrollments"("userId");

-- CreateIndex
CREATE INDEX "trainer_program_enrollments_programId_idx" ON "trainer_program_enrollments"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_program_enrollments_programId_userId_key" ON "trainer_program_enrollments"("programId", "userId");

-- CreateIndex
CREATE INDEX "community_stories_userId_idx" ON "community_stories"("userId");

-- CreateIndex
CREATE INDEX "community_stories_createdAt_idx" ON "community_stories"("createdAt");

-- CreateIndex
CREATE INDEX "community_stories_expiresAt_idx" ON "community_stories"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_story_views_storyId_userId_key" ON "community_story_views"("storyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_story_likes_storyId_userId_key" ON "community_story_likes"("storyId", "userId");

-- CreateIndex
CREATE INDEX "community_posts_audience_idx" ON "community_posts"("audience");

-- AddForeignKey
ALTER TABLE "community_friendships" ADD CONSTRAINT "community_friendships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_friendships" ADD CONSTRAINT "community_friendships_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_chat_participants" ADD CONSTRAINT "direct_chat_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "direct_chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_chat_participants" ADD CONSTRAINT "direct_chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_chat_messages" ADD CONSTRAINT "direct_chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "direct_chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_chat_messages" ADD CONSTRAINT "direct_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_exercises" ADD CONSTRAINT "trainer_exercises_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_programs" ADD CONSTRAINT "trainer_programs_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_program_enrollments" ADD CONSTRAINT "trainer_program_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "trainer_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_program_enrollments" ADD CONSTRAINT "trainer_program_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_stories" ADD CONSTRAINT "community_stories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_story_views" ADD CONSTRAINT "community_story_views_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "community_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_story_views" ADD CONSTRAINT "community_story_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_story_likes" ADD CONSTRAINT "community_story_likes_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "community_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_story_likes" ADD CONSTRAINT "community_story_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

