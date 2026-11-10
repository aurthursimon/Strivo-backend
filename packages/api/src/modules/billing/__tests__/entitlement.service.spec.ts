import type { BillingProvider, SubscriptionStatus } from '@prisma/client';
import { EntitlementService } from '../entitlement.service';
import { SubscriptionAccessService } from '../subscription-access.service';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function providerRow(
  provider: BillingProvider,
  status: SubscriptionStatus,
  currentPeriodEnd: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `${provider.toLowerCase()}-row`,
    provider,
    providerSubscriptionId: `${provider.toLowerCase()}-subscription`,
    status,
    plan: 'PREMIUM_YEARLY' as const,
    currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    currentPeriodEnd: new Date(currentPeriodEnd),
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    sourceUpdatedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createHarness(rows: ReturnType<typeof providerRow>[] = [], compedAccess = false) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
    user: {
      findUnique: jest.fn().mockResolvedValue({ compedAccess }),
    },
    billingSubject: {
      upsert: jest.fn().mockResolvedValue({ id: 'subject-1', userId: 'user-1' }),
    },
    billingSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    },
    premiumEntitlement: {
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    },
    premiumTrialUse: {
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    premiumEntitlement: {
      findFirst: jest.fn(),
    },
  };
  return { service: new EntitlementService(prisma as never), prisma, tx };
}

describe('EntitlementService', () => {
  it('returns an inactive aggregate for empty provider history', async () => {
    const { service } = createHarness();

    await expect(service.recomputeForUser('user-1', NOW)).resolves.toMatchObject({
      active: false,
      inGracePeriod: false,
      validUntil: null,
      managementProvider: 'NONE',
      sourceProvider: null,
      status: null,
      plan: null,
    });
  });

  it('preserves the exact bounded access from one active provider row', async () => {
    const validUntil = '2026-09-26T12:00:00.000Z';
    const { service } = createHarness([providerRow('APP_STORE', 'ACTIVE', validUntil)]);

    await expect(service.recomputeForUser('user-1', NOW)).resolves.toMatchObject({
      active: true,
      inGracePeriod: false,
      validUntil: new Date(validUntil),
      managementProvider: 'APP_STORE',
      sourceProvider: 'APP_STORE',
      status: 'ACTIVE',
    });
  });

  it('keeps mixed provider rows independent and selects the longest valid access', async () => {
    const { service, tx } = createHarness([
      providerRow('APP_STORE', 'ACTIVE', '2026-09-01T00:00:00.000Z'),
      providerRow('PLAY_STORE', 'PAST_DUE', '2026-09-05T00:00:00.000Z'),
      providerRow('REVENUECAT_UNKNOWN', 'EXPIRED', '2026-12-01T00:00:00.000Z'),
    ]);

    await expect(service.recomputeForUser('user-1', NOW)).resolves.toMatchObject({
      active: true,
      inGracePeriod: true,
      managementProvider: 'PLAY_STORE',
      sourceProvider: 'PLAY_STORE',
      status: 'PAST_DUE',
      validUntil: new Date('2026-09-05T00:00:00.000Z'),
    });
    expect(tx.billingSubscription.findMany).toHaveBeenCalledTimes(1);
  });

  it('uses stable provider precedence for equal validity boundaries', async () => {
    const boundary = '2026-09-30T00:00:00.000Z';
    const { service } = createHarness([
      providerRow('PLAY_STORE', 'ACTIVE', boundary),
      providerRow('APP_STORE', 'ACTIVE', boundary),
      providerRow('REVENUECAT_UNKNOWN', 'ACTIVE', boundary),
    ]);

    await expect(service.recomputeForUser('user-1', NOW)).resolves.toMatchObject({
      managementProvider: 'APP_STORE',
      sourceProvider: 'APP_STORE',
      validUntil: new Date(boundary),
    });
  });

  it('grants comped access without inventing a provider or validity boundary', async () => {
    const { service } = createHarness([], true);

    await expect(service.recomputeForUser('user-1', NOW)).resolves.toMatchObject({
      active: true,
      inGracePeriod: false,
      validUntil: null,
      managementProvider: 'NONE',
      sourceProvider: null,
      status: null,
      plan: null,
    });
  });

  it('recomputes idempotently through one aggregate upsert key', async () => {
    const { service, tx } = createHarness([
      providerRow('APP_STORE', 'ACTIVE', '2026-09-26T12:00:00.000Z'),
    ]);

    const first = await service.recomputeForUser('user-1', NOW);
    const second = await service.recomputeForUser('user-1', NOW);

    expect(first).toEqual(second);
    expect(tx.premiumEntitlement.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { billingSubjectId: 'subject-1' } }),
    );
    expect(tx.premiumEntitlement.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { billingSubjectId: 'subject-1' } }),
    );
  });

  it('upserts only the addressed provider identity and then derives the aggregate', async () => {
    const { service, tx } = createHarness([
      providerRow('PLAY_STORE', 'ACTIVE', '2026-09-26T12:00:00.000Z'),
    ]);

    await service.upsertProviderSubscription(
      'user-1',
      {
        provider: 'APP_STORE',
        providerSubscriptionId: 'apple-original-1',
        providerCustomerId: null,
        providerOriginalTransactionId: 'apple-original-1',
        providerStore: 'app_store',
        providerEnvironment: 'SANDBOX',
        status: 'ACTIVE',
        plan: 'PREMIUM_MONTHLY',
        currentPeriodStart: NOW,
        currentPeriodEnd: new Date('2026-09-26T12:00:00.000Z'),
        trialStart: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        sourceUpdatedAt: NOW,
        rawVersion: 1,
      },
      NOW,
    );

    expect(tx.billingSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerSubscriptionId: {
            provider: 'APP_STORE',
            providerSubscriptionId: 'apple-original-1',
          },
        },
      }),
    );
    expect(tx.billingSubscription.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ billingSubjectId: 'subject-1' }),
      }),
    );
  });

  it('seeds one lifetime trial ledger repeatedly for the same subject', async () => {
    const { service, tx } = createHarness();
    const input = {
      provider: 'APP_STORE' as const,
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
      sourceSubscriptionId: 'legacy-subscription-1',
    };

    await service.seedTrialUse('user-1', input);
    await service.seedTrialUse('user-1', input);

    expect(tx.premiumTrialUse.upsert).toHaveBeenCalledTimes(2);
    expect(tx.premiumTrialUse.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { billingSubjectId: 'subject-1' },
        update: {},
      }),
    );
  });

  it('requests the same user row lock before concurrent entitlement and trial writes', async () => {
    const { service, tx } = createHarness([
      providerRow('APP_STORE', 'ACTIVE', '2026-09-26T12:00:00.000Z'),
    ]);

    await Promise.all([
      service.recomputeForUser('user-1', NOW),
      service.seedTrialUse('user-1', {
        provider: 'APP_STORE',
        startedAt: NOW,
        sourceSubscriptionId: 'legacy-subscription-1',
      }),
    ]);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect((query as { strings: readonly string[] }).strings.join('?')).toContain('FOR UPDATE');
    }
  });

  it('expires only prior RevenueCat native rows during a provider switch', async () => {
    const oldAppStore = providerRow('APP_STORE', 'ACTIVE', '2026-09-26T12:00:00.000Z', {
      providerSubscriptionId: 'apple-original-1',
      sourceUpdatedAt: new Date('2026-08-25T12:00:00.000Z'),
      rawVersion: 1_777_564_800,
    });
    const { service, tx } = createHarness([oldAppStore]);

    await service.reconcileStoreProviderSubscriptions(
      'user-1',
      [
        {
          provider: 'PLAY_STORE',
          providerSubscriptionId: 'play-original-1',
          providerCustomerId: null,
          providerOriginalTransactionId: 'play-original-1',
          providerStore: 'play_store',
          providerEnvironment: 'SANDBOX',
          status: 'ACTIVE',
          plan: 'PREMIUM_MONTHLY',
          currentPeriodStart: NOW,
          currentPeriodEnd: new Date('2026-09-26T12:00:00.000Z'),
          trialStart: null,
          trialEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          sourceUpdatedAt: NOW,
          rawVersion: 1,
        },
      ],
      NOW,
      NOW.getTime(),
    );

    expect(tx.billingSubscription.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          billingSubjectId: 'subject-1',
          provider: { in: ['APP_STORE', 'PLAY_STORE', 'REVENUECAT_UNKNOWN'] },
        },
      }),
    );
    expect(tx.billingSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'app_store-row', billingSubjectId: 'subject-1' },
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
    expect(tx.billingSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerSubscriptionId: {
            provider: 'PLAY_STORE',
            providerSubscriptionId: 'play-original-1',
          },
        },
      }),
    );
  });

  it('serves the aggregate through the existing billing status seam', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ compedAccess: false, subscription: null }),
      },
    };
    const entitlement = {
      getForUser: jest.fn().mockResolvedValue({
        active: true,
        inGracePeriod: false,
        validUntil: new Date('2099-09-26T12:00:00.000Z'),
        managementProvider: 'APP_STORE',
        sourceProvider: 'APP_STORE',
        status: 'ACTIVE',
        plan: 'PREMIUM_YEARLY',
        trialEnd: null,
        currentPeriodEnd: new Date('2099-09-26T12:00:00.000Z'),
        cancelAtPeriodEnd: false,
        version: 1,
      }),
    };
    const service = new SubscriptionAccessService(
      prisma as never,
      {
        REVENUECAT_SECRET_API_KEY: 'configured-secret-key',
        REVENUECAT_PRODUCT_PREMIUM_MONTHLY: 'monthly',
        REVENUECAT_PRODUCT_PREMIUM_YEARLY: 'yearly',
      } as never,
      entitlement as never,
    );

    await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
      subscribed: true,
      hasSubscription: true,
      status: 'ACTIVE',
      plan: 'YEARLY',
      provider: 'APP_STORE',
      managementProvider: 'APP_STORE',
      entitlementValidUntil: '2099-09-26T12:00:00.000Z',
    });
  });
});
