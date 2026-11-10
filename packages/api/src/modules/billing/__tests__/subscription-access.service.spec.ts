import { SubscriptionAccessService } from '../subscription-access.service';

const appleIapEnv = { APPLE_IAP_KEY_ID: 'TESTKEY123', APPLE_IAP_ISSUER_ID: 'test-issuer', APPLE_IAP_PRIVATE_KEY_BASE64: 'dGVzdA==' };

describe('SubscriptionAccessService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    premiumEntitlement: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.premiumEntitlement.findFirst.mockResolvedValue(null);
  });

  it('uses the canonical native-store entitlement to grant access', async () => {
    const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
    const currentPeriodEnd = new Date(Date.now() + 86_400_000);
    prisma.user.findUnique.mockResolvedValue({ compedAccess: false });
    prisma.premiumEntitlement.findFirst.mockResolvedValue({
      active: true,
      inGracePeriod: false,
      validUntil: currentPeriodEnd,
      managementProvider: 'APP_STORE',
      sourceProvider: 'APP_STORE',
      status: 'ACTIVE',
      plan: 'PREMIUM_MONTHLY',
      trialEnd: null,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      version: 1,
    });

    await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
      subscribed: true,
      hasSubscription: true,
      dailyScanLimit: 5,
      provider: 'APP_STORE',
      managementProvider: 'APP_STORE',
    });
  });

  it('grants complete app access during an active yearly trial', async () => {
    const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
    const trialEnd = new Date(Date.now() + 7 * 86_400_000);
    prisma.user.findUnique.mockResolvedValue({ compedAccess: false });
    prisma.premiumEntitlement.findFirst.mockResolvedValue({
      active: true,
      inGracePeriod: false,
      validUntil: trialEnd,
      managementProvider: 'APP_STORE',
      sourceProvider: 'APP_STORE',
      status: 'TRIALING',
      plan: 'PREMIUM_YEARLY',
      trialEnd,
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
      version: 1,
    });

    await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
      subscribed: true,
      hasSubscription: true,
      status: 'TRIALING',
      plan: 'YEARLY',
      canScan: true,
      dailyScanLimit: 5,
    });
    await expect(service.getScanAccess('user-1')).resolves.toEqual({
      canScan: true,
      dailyLimit: 5,
    });
  });

  it('limits complimentary accounts to five scans per day', async () => {
    const service = new SubscriptionAccessService(prisma as never, {} as never);
    prisma.user.findUnique.mockResolvedValue({ compedAccess: true });

    await expect(service.getScanAccess('user-1')).resolves.toEqual({
      canScan: true,
      dailyLimit: 5,
    });
  });

  it('requires a verified entitlement for paid access', async () => {
    const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
    prisma.user.findUnique.mockResolvedValue({ compedAccess: false });

    expect(service.isBillingEnforced()).toBe(true);
    await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
      billingEnforced: true,
      subscribed: false,
      hasSubscription: false,
      canScan: false,
    });
  });

  it('does not grant free access when store configuration is absent', async () => {
    const service = new SubscriptionAccessService(prisma as never, {} as never);
    prisma.user.findUnique.mockResolvedValue({ compedAccess: false });

    await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
      billingEnforced: true,
      subscribed: false,
      hasSubscription: false,
      canScan: false,
      provider: null,
      managementProvider: 'NONE',
    });
  });

  describe('paid access after removing the no-card trial', () => {
    it('does not grant access for an old 3-day trial timestamp without an entitlement', async () => {
      const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
      const trialActivatedAt = new Date(Date.now() - 2 * 86_400_000);
      prisma.user.findUnique.mockResolvedValue({ compedAccess: false, trialActivatedAt });

      await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
        subscribed: false,
        hasSubscription: false,
        plan: null,
        canScan: false,
        dailyScanLimit: 0,
      });
      await expect(service.getScanAccess('user-1')).resolves.toEqual({
        canScan: false,
        dailyLimit: 0,
      });
    });

    it('falls back to no access once the 3-day trial window has elapsed', async () => {
      const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
      const trialActivatedAt = new Date(Date.now() - 4 * 86_400_000);
      prisma.user.findUnique.mockResolvedValue({ compedAccess: false, trialActivatedAt });

      await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
        subscribed: false,
        canScan: false,
        dailyScanLimit: 0,
      });
      await expect(service.getScanAccess('user-1')).resolves.toEqual({
        canScan: false,
        dailyLimit: 0,
      });
    });

    it('prefers a real active entitlement over the trial window', async () => {
      const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
      const currentPeriodEnd = new Date(Date.now() + 86_400_000);
      prisma.user.findUnique.mockResolvedValue({
        compedAccess: false,
        trialActivatedAt: new Date(Date.now() - 86_400_000),
      });
      prisma.premiumEntitlement.findFirst.mockResolvedValue({
        active: true,
        inGracePeriod: false,
        validUntil: currentPeriodEnd,
        managementProvider: 'STRIPE',
        sourceProvider: 'STRIPE',
        status: 'ACTIVE',
        plan: 'PREMIUM_MONTHLY',
        trialEnd: null,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        version: 1,
      });

      await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
        subscribed: true,
        plan: 'MONTHLY',
        provider: 'STRIPE',
      });
    });

    it('does not revive an expired entitlement from an old trial timestamp', async () => {
      const service = new SubscriptionAccessService(prisma as never, appleIapEnv as never);
      prisma.user.findUnique.mockResolvedValue({
        compedAccess: false,
        trialActivatedAt: new Date(Date.now() - 86_400_000),
      });
      prisma.premiumEntitlement.findFirst.mockResolvedValue({
        active: false,
        inGracePeriod: false,
        validUntil: new Date(Date.now() - 30 * 86_400_000),
        managementProvider: 'STRIPE',
        sourceProvider: 'STRIPE',
        status: 'EXPIRED',
        plan: 'PREMIUM_MONTHLY',
        trialEnd: null,
        currentPeriodEnd: new Date(Date.now() - 30 * 86_400_000),
        cancelAtPeriodEnd: false,
        version: 1,
      });

      await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
        subscribed: false,
        plan: 'MONTHLY',
        canScan: false,
      });
    });
  });

  describe('free-tier usage counters', () => {
    it('reports zeroed usage for a user with no counter row yet', async () => {
      const service = new SubscriptionAccessService(prisma as never, {} as never);
      prisma.user.findUnique.mockResolvedValue(undefined);

      await expect(service.getFreeTierUsage('user-1')).resolves.toEqual({
        scansUsed: 0,
        scansLimit: 2,
        mealLogsUsed: 0,
        mealLogsLimit: 2,
        doseUsed: false,
        doseMaxMg: 2.5,
      });
    });

    it('includes freeTier usage in every getStatusPayload branch', async () => {
      const service = new SubscriptionAccessService(prisma as never, {} as never);
      prisma.user.findUnique.mockResolvedValue({
        compedAccess: false,
        freeScansUsed: 1,
        freeMealLogsUsed: 2,
        freeDoseUsed: true,
      });

      await expect(service.getStatusPayload('user-1')).resolves.toMatchObject({
        freeTier: {
          scansUsed: 1,
          scansLimit: 2,
          mealLogsUsed: 2,
          mealLogsLimit: 2,
          doseUsed: true,
          doseMaxMg: 2.5,
        },
      });
    });

    it('consumeFreeMealLog only succeeds while under the limit, atomically', async () => {
      const service = new SubscriptionAccessService(prisma as never, {} as never);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.consumeFreeMealLog('user-1')).resolves.toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', freeMealLogsUsed: { lt: 2 } },
        data: { freeMealLogsUsed: { increment: 1 } },
      });

      // Simulates a second concurrent request (or a user already at the
      // limit): the WHERE clause matches zero rows, so count is 0 and the
      // caller knows its own request did NOT get the slot.
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.consumeFreeMealLog('user-1')).resolves.toBe(false);
    });

    it('consumeFreeDose only succeeds once (freeDoseUsed flips false -> true exactly once)', async () => {
      const service = new SubscriptionAccessService(prisma as never, {} as never);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.consumeFreeDose('user-1')).resolves.toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', freeDoseUsed: false },
        data: { freeDoseUsed: true },
      });

      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.consumeFreeDose('user-1')).resolves.toBe(false);
    });

    it('consumeFreeScan only succeeds while under the lifetime limit', async () => {
      const service = new SubscriptionAccessService(prisma as never, {} as never);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.consumeFreeScan('user-1')).resolves.toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', freeScansUsed: { lt: 2 } },
        data: { freeScansUsed: { increment: 1 } },
      });

      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.consumeFreeScan('user-1')).resolves.toBe(false);
    });

    it('isSubscribed mirrors getStatusPayload.subscribed', async () => {
      const service = new SubscriptionAccessService(prisma as never, {} as never);
      prisma.user.findUnique.mockResolvedValue({ compedAccess: true });
      await expect(service.isSubscribed('user-1')).resolves.toBe(true);

      prisma.user.findUnique.mockResolvedValue({ compedAccess: false });
      await expect(service.isSubscribed('user-1')).resolves.toBe(false);
    });
  });
});

it('enforces billing with only the configured monthly Apple subscription', () => {
  const service = new SubscriptionAccessService(
    {} as never,
    {
      ...appleIapEnv,
      APPLE_IAP_MONTHLY_PRODUCT_ID: 'monthly_29_99',
    } as never,
  );
  expect(service.isBillingEnforced()).toBe(true);
});
