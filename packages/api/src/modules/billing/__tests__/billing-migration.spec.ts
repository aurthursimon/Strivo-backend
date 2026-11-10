import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('provider-safe billing migration', () => {
  const migration = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260826010000_add_provider_safe_billing/migration.sql'),
    'utf8',
  );

  it('stores a false grace-period flag when no provider subscription wins', () => {
    expect(migration).toContain(
      'COALESCE(winner."status" = \'PAST_DUE\'::"SubscriptionStatus", false)',
    );
  });
});

describe('legacy subscription removal migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260829223000_remove_legacy_subscription_model/migration.sql',
    ),
    'utf8',
  );
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('refuses to drop an unmigrated legacy row', () => {
    expect(migration).toContain('canonical."legacySubscriptionId" = legacy."id"');
    expect(migration).toContain('RAISE EXCEPTION');
  });

  it('drops only the legacy table after the safety check', () => {
    expect(migration).toContain('DROP TABLE "subscriptions";');
    expect(migration).not.toContain('DROP TABLE "billing_subscriptions"');
    expect(migration).not.toContain('DROP TABLE "premium_entitlements"');
  });

  it('removes the legacy Prisma model and relation', () => {
    expect(schema).not.toMatch(/model Subscription\s*\{/);
    expect(schema).not.toMatch(/subscription\s+Subscription\?/);
    expect(schema).toMatch(/model BillingSubscription\s*\{/);
    expect(schema).toMatch(/model PremiumEntitlement\s*\{/);
  });
});

describe('external billing removal migration', () => {
  const migration = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260902120000_remove_external_billing/migration.sql'),
    'utf8',
  );

  it('recreates the entitlement constraint around the provider enum replacement', () => {
    const dropConstraint = migration.indexOf(
      'DROP CONSTRAINT "premium_entitlements_inactive_state"',
    );
    const replaceColumnType = migration.indexOf(
      'ALTER COLUMN "managementProvider" TYPE "BillingManagementProvider"',
    );
    const addConstraint = migration.indexOf('ADD CONSTRAINT "premium_entitlements_inactive_state"');

    expect(dropConstraint).toBeGreaterThan(-1);
    expect(replaceColumnType).toBeGreaterThan(dropConstraint);
    expect(addConstraint).toBeGreaterThan(replaceColumnType);
    expect(migration).toContain('"managementProvider" = \'NONE\'::"BillingManagementProvider"');
  });
});
