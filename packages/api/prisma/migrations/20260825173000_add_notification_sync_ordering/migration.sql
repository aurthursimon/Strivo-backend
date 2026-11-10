ALTER TABLE "notification_preferences"
ADD COLUMN "syncOccurredAt" TIMESTAMP(3),
ADD COLUMN "syncMutationId" UUID,
ADD COLUMN "syncInstallationId" UUID,
ADD COLUMN "syncSequence" INTEGER;
