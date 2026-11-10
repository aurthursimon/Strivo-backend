CREATE TABLE "load_test_events" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'default',
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_test_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "load_test_events_bucket_createdAt_idx" ON "load_test_events"("bucket", "createdAt");
CREATE INDEX "load_test_events_createdAt_idx" ON "load_test_events"("createdAt");
