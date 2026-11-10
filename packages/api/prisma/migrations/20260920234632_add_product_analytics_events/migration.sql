-- CreateTable
CREATE TABLE "product_analytics_events" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "eventName" TEXT NOT NULL,
    "stepId" TEXT,
    "stepIndex" INTEGER,
    "direction" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "gclid" TEXT,
    "country" TEXT,
    "platform" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "deviceType" TEXT,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_analytics_events_visitorId_idx" ON "product_analytics_events"("visitorId");

-- CreateIndex
CREATE INDEX "product_analytics_events_eventName_idx" ON "product_analytics_events"("eventName");

-- CreateIndex
CREATE INDEX "product_analytics_events_createdAt_idx" ON "product_analytics_events"("createdAt");

-- CreateIndex
CREATE INDEX "product_analytics_events_utmCampaign_idx" ON "product_analytics_events"("utmCampaign");

-- CreateIndex
CREATE INDEX "product_analytics_events_userId_idx" ON "product_analytics_events"("userId");

-- AddForeignKey
ALTER TABLE "product_analytics_events" ADD CONSTRAINT "product_analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
