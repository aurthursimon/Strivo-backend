-- One-time data fix, not a schema change - same pattern as the earlier
-- grant_admin_dashboard_access/reset_product_analytics_events migrations
-- (Render's free plan has no Shell access, but `prisma migrate deploy`
-- already runs automatically on every deploy via render.yaml's
-- preDeployCommand, so this applies without needing direct DB access).
--
-- Sets a known password on the pre-existing admin@mypeptides.app account
-- (already isAdmin=true, see 20260930193000_grant_admin_dashboard_access)
-- so it can be logged into via the normal email/password form right away,
-- without needing to recover whatever password it previously had or own
-- the mypeptides.app inbox to use "forgot password". The actual password
-- is shared out of band (chat), never committed here - only its bcrypt
-- hash (12 rounds, matching AuthService.BCRYPT_ROUNDS) is persisted, same
-- as a normal registration/password-reset would produce. Also pins
-- provider/emailVerified so login's `user.passwordHash` check always has
-- what it needs, regardless of how this row looked before.
UPDATE "users"
SET
  "passwordHash" = '$2b$12$djey.5xpIdiIZ.7Bnbf08e4pIzqf3g6o1zkD2eHWaH0ME0IVqG.yq',
  "provider" = 'EMAIL',
  "emailVerified" = true,
  "isAdmin" = true
WHERE "email" = 'admin@mypeptides.app';
