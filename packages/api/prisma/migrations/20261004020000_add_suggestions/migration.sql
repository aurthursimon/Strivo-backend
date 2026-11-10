-- CreateTable
CREATE TABLE "suggestions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suggestions_createdAt_idx" ON "suggestions" ("createdAt");

CREATE INDEX "suggestions_userId_idx" ON "suggestions" ("userId");

ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
