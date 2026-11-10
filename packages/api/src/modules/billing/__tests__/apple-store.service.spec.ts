import { AppleStoreService } from '../apple-store.service';
import { AppleStoreGateway } from '../apple-store.gateway';
import { generateKeyPairSync } from 'node:crypto';
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env = {
  APPLE_IAP_KEY_ID: 'TESTKEY123',
  APPLE_IAP_ISSUER_ID: token,
  APPLE_IAP_PRIVATE_KEY_BASE64: 'dGVzdA==',
  APPLE_IAP_MONTHLY_PRODUCT_ID: 'monthly_29_99',
  APPLE_IAP_BUNDLE_ID: 'app.mypeptides.glp1',
  APPLE_IAP_ENVIRONMENT: 'Sandbox',
};
const evidence = () => ({
  status: 1,
  transaction: {
    appAccountToken: token,
    productId: 'monthly_29_99',
    bundleId: 'app.mypeptides.glp1',
    environment: 'Sandbox',
    originalTransactionId: '10001',
    type: 'Auto-Renewable Subscription',
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 86400000,
    signedDate: Date.now(),
  },
});
function setup() {
  const prisma = {
    billingSubject: { findUnique: jest.fn().mockResolvedValue({ userId: 'user-1' }) },
    billingSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    revenueCatWebhookEvent: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
  };
  const apple = {
    latest: jest.fn().mockResolvedValue(evidence()),
    notification: jest
      .fn()
      .mockResolvedValue({
        notificationUUID: 'event-1',
        notificationType: 'DID_RENEW',
        data: { signedTransactionInfo: 'signed' },
      }),
    transaction: jest.fn().mockResolvedValue(evidence().transaction),
  };
  const entitlement = {
    ensureBillingSubject: jest.fn().mockResolvedValue(token),
    upsertProviderSubscription: jest.fn(),
  };
  const access = { getStatusPayload: jest.fn().mockResolvedValue({ subscribed: true }) };
  return {
    prisma,
    apple,
    entitlement,
    access,
    service: new AppleStoreService(
      prisma as never,
      env as never,
      apple as never,
      entitlement as never,
      access as never,
    ),
  };
}
describe('Apple purchase ownership and notifications', () => {
  it('returns the account UUID and verifies latest evidence before access', async () => {
    const s = setup();
    expect(await s.service.accountToken('user-1')).toEqual({ appAccountToken: token, verificationMode: "server-api" });
    await expect(s.service.verify('user-1', '10002')).resolves.toEqual({ subscribed: true });
    expect(s.apple.latest).toHaveBeenCalledWith('10002');
    expect(s.entitlement.upsertProviderSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ provider: 'APP_STORE' }),
    );
  });
  it('rejects a purchase bound to another account', async () => {
    const s = setup();
    const item = evidence();
    item.transaction.appAccountToken = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    s.apple.latest.mockResolvedValue(item);
    await expect(s.service.verify('user-1', '10002')).rejects.toThrow('another account');
    expect(s.entitlement.upsertProviderSubscription).not.toHaveBeenCalled();
  });
  it('never claims an unlinked purchase without an account token', async () => {
    const s = setup();
    const item = evidence();
    item.transaction.appAccountToken = '';
    s.apple.latest.mockResolvedValue(item);
    await expect(s.service.verify('user-1', '10002')).rejects.toThrow('Unlinked');
    s.prisma.billingSubscription.findUnique.mockResolvedValue({ billingSubjectId: token } as never);
    await expect(s.service.verify('user-1', '10002')).resolves.toEqual({ subscribed: true });
  });
  it('rejects unverified notifications without acknowledging or writing', async () => {
    const s = setup();
    s.apple.notification.mockRejectedValue(new Error('invalid signature'));
    await expect(s.service.notification('forged')).rejects.toThrow('invalid signature');
    expect(s.prisma.revenueCatWebhookEvent.upsert).not.toHaveBeenCalled();
    expect(s.entitlement.upsertProviderSubscription).not.toHaveBeenCalled();
  });
  it('deduplicates processed notifications and refreshes latest status for new ones', async () => {
    const s = setup();
    s.prisma.revenueCatWebhookEvent.findUnique.mockResolvedValueOnce({
      status: 'PROCESSED',
    } as never);
    await s.service.notification('signed');
    expect(s.apple.latest).not.toHaveBeenCalled();
    await s.service.notification('signed');
    expect(s.apple.latest).toHaveBeenCalledWith('10001');
    expect(s.prisma.revenueCatWebhookEvent.upsert).toHaveBeenCalledTimes(1);
  });
  it('leaves failed updates retryable and ignores detached accounts', async () => {
    const s = setup();
    s.apple.latest.mockRejectedValue(new Error('Apple outage'));
    await expect(s.service.notification('signed')).rejects.toThrow('Apple outage');
    expect(s.prisma.revenueCatWebhookEvent.upsert).not.toHaveBeenCalled();
    s.prisma.billingSubject.findUnique.mockResolvedValue({ userId: null } as never);
    await expect(s.service.notification('signed')).resolves.toEqual({ received: true });
    expect(s.entitlement.upsertProviderSubscription).not.toHaveBeenCalled();
  });
  it('fails closed when purchase verification is not configured', async () => {
    const s = setup();
    const service = new AppleStoreService(
      s.prisma as never,
      {} as never,
      s.apple as never,
      s.entitlement as never,
      s.access as never,
    );
    await expect(service.accountToken('user-1')).rejects.toThrow('not configured');
    expect(s.entitlement.ensureBillingSubject).not.toHaveBeenCalled();
  });
  it('uses the real Apple verifier to reject a forged notification', async () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const gateway = new AppleStoreGateway({
      ...env,
      APPLE_IAP_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
    } as never);
    await expect(gateway.notification('not.a.signed-apple-payload')).rejects.toThrow();
  });
});
