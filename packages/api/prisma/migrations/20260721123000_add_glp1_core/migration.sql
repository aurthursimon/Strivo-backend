-- GLP-1 is a tracking-only domain. The database stores user-reported or
-- prescription-sourced data and never derives a recommended dose.

CREATE TYPE "Glp1TreatmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "Glp1Route" AS ENUM ('SUBCUTANEOUS', 'ORAL');
CREATE TYPE "Glp1Source" AS ENUM ('USER', 'PRESCRIPTION', 'CLINICIAN', 'PHARMACIST', 'OTHER');
CREATE TYPE "Glp1DoseStatus" AS ENUM ('SCHEDULED', 'TAKEN', 'MISSED', 'SKIPPED');

CREATE TABLE "glp1_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "scopesJson" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientAcceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "glp1_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "glp1_treatments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeIngredient" TEXT NOT NULL,
    "brandName" TEXT,
    "route" "Glp1Route" NOT NULL,
    "formulation" TEXT,
    "currentDoseMg" DECIMAL(10,4) NOT NULL,
    "intervalHours" DECIMAL(10,2) NOT NULL,
    "usualWeekday" INTEGER,
    "usualLocalTime" TEXT,
    "timezone" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "status" "Glp1TreatmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "Glp1Source" NOT NULL DEFAULT 'USER',
    "sourceReference" TEXT,
    "notes" TEXT,
    "startWeightKg" DECIMAL(10,3),
    "baselineSymptomsJson" JSONB,
    "motivation" TEXT,
    "cravingPeakDay" INTEGER,
    "clientMutationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "glp1_treatments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "glp1_treatments_cravingPeakDay_check" CHECK ("cravingPeakDay" IS NULL OR ("cravingPeakDay" >= 0 AND "cravingPeakDay" <= 6))
);

CREATE TABLE "glp1_dose_plan_periods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "doseMg" DECIMAL(10,4) NOT NULL,
    "intervalHours" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "source" "Glp1Source" NOT NULL DEFAULT 'USER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "glp1_dose_plan_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "glp1_dose_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),
    "takenAt" TIMESTAMP(3),
    "doseMg" DECIMAL(10,4) NOT NULL,
    "status" "Glp1DoseStatus" NOT NULL DEFAULT 'SCHEDULED',
    "route" "Glp1Route" NOT NULL,
    "injectionSiteCode" TEXT,
    "painLevel" INTEGER,
    "notes" TEXT,
    "source" "Glp1Source" NOT NULL DEFAULT 'USER',
    "clientMutationId" TEXT,
    "possibleDuplicateOfId" TEXT,
    "duplicateConfirmedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "glp1_dose_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "glp1_dose_events_painLevel_check" CHECK ("painLevel" IS NULL OR ("painLevel" >= 0 AND "painLevel" <= 10))
);

CREATE TABLE "glp1_symptom_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customName" TEXT,
    "severity" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "relatedDoseEventIdsJson" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "safetyContentVersion" TEXT,
    "clientMutationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "glp1_symptom_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "glp1_symptom_events_severity_check" CHECK ("severity" >= 0 AND "severity" <= 10),
    CONSTRAINT "glp1_symptom_events_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" >= 0),
    CONSTRAINT "glp1_symptom_events_safety_ack_check" CHECK ("severity" < 7 OR ("acknowledgedAt" IS NOT NULL AND "safetyContentVersion" IS NOT NULL))
);

CREATE TABLE "glp1_reminder_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channel" TEXT NOT NULL DEFAULT 'local',
    "timezone" TEXT NOT NULL,
    "clientMutationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "glp1_reminder_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "glp1_injection_site_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteCode" TEXT NOT NULL,
    "unavailable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "glp1_injection_site_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "glp1_setup_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "glp1_setup_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "glp1_consents_userId_acceptedAt_idx" ON "glp1_consents"("userId", "acceptedAt");
CREATE UNIQUE INDEX "glp1_treatments_userId_clientMutationId_key" ON "glp1_treatments"("userId", "clientMutationId");
CREATE INDEX "glp1_treatments_userId_status_idx" ON "glp1_treatments"("userId", "status");
CREATE INDEX "glp1_treatments_userId_createdAt_idx" ON "glp1_treatments"("userId", "createdAt");
CREATE UNIQUE INDEX "glp1_treatments_one_active_per_user_key" ON "glp1_treatments"("userId") WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
CREATE INDEX "glp1_dose_plan_periods_userId_treatmentId_validFrom_idx" ON "glp1_dose_plan_periods"("userId", "treatmentId", "validFrom");
CREATE UNIQUE INDEX "glp1_dose_plan_periods_treatmentId_validFrom_key" ON "glp1_dose_plan_periods"("treatmentId", "validFrom");
CREATE UNIQUE INDEX "glp1_dose_plan_periods_one_open_per_treatment_key" ON "glp1_dose_plan_periods"("treatmentId") WHERE "validUntil" IS NULL;
CREATE UNIQUE INDEX "glp1_dose_events_userId_clientMutationId_key" ON "glp1_dose_events"("userId", "clientMutationId");
CREATE INDEX "glp1_dose_events_userId_treatmentId_takenAt_idx" ON "glp1_dose_events"("userId", "treatmentId", "takenAt");
CREATE INDEX "glp1_dose_events_userId_treatmentId_scheduledAt_idx" ON "glp1_dose_events"("userId", "treatmentId", "scheduledAt");
CREATE INDEX "glp1_dose_events_userId_status_idx" ON "glp1_dose_events"("userId", "status");
CREATE UNIQUE INDEX "glp1_symptom_events_userId_clientMutationId_key" ON "glp1_symptom_events"("userId", "clientMutationId");
CREATE INDEX "glp1_symptom_events_userId_treatmentId_occurredAt_idx" ON "glp1_symptom_events"("userId", "treatmentId", "occurredAt");
CREATE INDEX "glp1_symptom_events_userId_severity_occurredAt_idx" ON "glp1_symptom_events"("userId", "severity", "occurredAt");
CREATE UNIQUE INDEX "glp1_reminder_rules_userId_treatmentId_eventType_offsetMinutes_channel_key" ON "glp1_reminder_rules"("userId", "treatmentId", "eventType", "offsetMinutes", "channel");
CREATE UNIQUE INDEX "glp1_reminder_rules_userId_clientMutationId_key" ON "glp1_reminder_rules"("userId", "clientMutationId");
CREATE INDEX "glp1_reminder_rules_userId_treatmentId_idx" ON "glp1_reminder_rules"("userId", "treatmentId");
CREATE UNIQUE INDEX "glp1_injection_site_states_userId_siteCode_key" ON "glp1_injection_site_states"("userId", "siteCode");
CREATE INDEX "glp1_injection_site_states_userId_idx" ON "glp1_injection_site_states"("userId");
CREATE UNIQUE INDEX "glp1_setup_submissions_userId_idempotencyKey_key" ON "glp1_setup_submissions"("userId", "idempotencyKey");
CREATE INDEX "glp1_setup_submissions_userId_createdAt_idx" ON "glp1_setup_submissions"("userId", "createdAt");

ALTER TABLE "glp1_consents" ADD CONSTRAINT "glp1_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_treatments" ADD CONSTRAINT "glp1_treatments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_dose_plan_periods" ADD CONSTRAINT "glp1_dose_plan_periods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_dose_plan_periods" ADD CONSTRAINT "glp1_dose_plan_periods_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "glp1_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_dose_events" ADD CONSTRAINT "glp1_dose_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_dose_events" ADD CONSTRAINT "glp1_dose_events_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "glp1_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_symptom_events" ADD CONSTRAINT "glp1_symptom_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_symptom_events" ADD CONSTRAINT "glp1_symptom_events_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "glp1_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_reminder_rules" ADD CONSTRAINT "glp1_reminder_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_reminder_rules" ADD CONSTRAINT "glp1_reminder_rules_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "glp1_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_injection_site_states" ADD CONSTRAINT "glp1_injection_site_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "glp1_setup_submissions" ADD CONSTRAINT "glp1_setup_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
