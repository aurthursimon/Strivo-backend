-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "breakfast" BOOLEAN NOT NULL DEFAULT true,
    "breakfastTime" TEXT NOT NULL DEFAULT '07:00',
    "lunch" BOOLEAN NOT NULL DEFAULT true,
    "lunchTime" TEXT NOT NULL DEFAULT '12:00',
    "afternoonSnack" BOOLEAN NOT NULL DEFAULT false,
    "afternoonSnackTime" TEXT NOT NULL DEFAULT '15:00',
    "dinner" BOOLEAN NOT NULL DEFAULT true,
    "dinnerTime" TEXT NOT NULL DEFAULT '19:00',
    "water" BOOLEAN NOT NULL DEFAULT true,
    "waterIntervalH" INTEGER NOT NULL DEFAULT 2,
    "streakRisk" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushSubscription" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_summaries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "avgCalories" DOUBLE PRECISION NOT NULL,
    "avgProteinG" DOUBLE PRECISION NOT NULL,
    "avgCarbsG" DOUBLE PRECISION NOT NULL,
    "avgFatG" DOUBLE PRECISION NOT NULL,
    "totalMeals" INTEGER NOT NULL,
    "daysLogged" INTEGER NOT NULL,
    "avgWaterMl" DOUBLE PRECISION NOT NULL,
    "startWeightKg" DOUBLE PRECISION,
    "endWeightKg" DOUBLE PRECISION,
    "weightChangeKg" DOUBLE PRECISION,
    "targetCalories" INTEGER,
    "adherencePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_summaries_userId_weekStart_key" ON "weekly_summaries"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "weekly_summaries_userId_weekStart_idx" ON "weekly_summaries"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
