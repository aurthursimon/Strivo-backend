-- CreateTable
CREATE TABLE "workout_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "splitType" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "equipment" TEXT NOT NULL,
    "minutesPerSession" INTEGER NOT NULL,
    "focusAreasJson" JSONB NOT NULL,
    "daysJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workout_templates_slug_key" ON "workout_templates"("slug");

-- CreateIndex
CREATE INDEX "workout_templates_experience_daysPerWeek_idx" ON "workout_templates"("experience", "daysPerWeek");

-- CreateIndex
CREATE INDEX "workout_templates_splitType_idx" ON "workout_templates"("splitType");
