ALTER TYPE "Gender" ADD VALUE IF NOT EXISTS 'PREFER_NOT_TO_SAY';

CREATE TYPE "MeasurementSystem" AS ENUM ('METRIC', 'IMPERIAL');
CREATE TYPE "RegionDetectionSource" AS ENUM ('DEVICE_REGION', 'TIMEZONE', 'MANUAL');
CREATE TYPE "MedicationMarket" AS ENUM ('BRAZIL', 'UNITED_STATES', 'EUROPE', 'ASIA', 'INTERNATIONAL');

ALTER TABLE "users"
ADD COLUMN "countryCode" CHAR(2),
ADD COLUMN "timezone" TEXT,
ADD COLUMN "measurementSystem" "MeasurementSystem",
ADD COLUMN "regionDetectionSource" "RegionDetectionSource";

ALTER TABLE "glp1_treatments"
ADD COLUMN "medicationMarket" "MedicationMarket",
ADD COLUMN "medicationCountryCode" CHAR(2);

ALTER TABLE "goals"
ALTER COLUMN "algorithmVersion" SET DEFAULT 'mifflin-st-jeor-v2-neutral-unspecified';
