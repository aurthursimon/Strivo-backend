-- One-time data fix, not a schema change: grants isAdmin to the account
-- just created for the newly-deployed admin-dashboard. Render's free plan
-- has no Shell access to run this by hand, but `prisma migrate deploy`
-- already runs automatically on every deploy (render.yaml's
-- preDeployCommand), so shipping it as a migration applies it without
-- needing direct DB access at all. Safe to leave in migration history
-- afterward - it only ever matches this one row, once.
UPDATE "users" SET "isAdmin" = true WHERE "email" = 'admin@mypeptides.app';
