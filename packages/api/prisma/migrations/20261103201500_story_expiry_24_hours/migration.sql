-- Enforce the 24-hour window for existing stories without deleting content.
UPDATE "community_stories"
SET "expiresAt" = LEAST("expiresAt", "createdAt" + INTERVAL '24 hours');
