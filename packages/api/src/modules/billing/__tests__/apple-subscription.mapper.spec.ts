import { appleSubscriptionInput } from '../apple-subscription.mapper';
import type { AppleSubscriptionEvidence } from '../apple-store.gateway';
import type { Env } from '../../../config';
const env = {
  APPLE_IAP_MONTHLY_PRODUCT_ID: 'monthly_29_99',
  APPLE_IAP_BUNDLE_ID: 'app.mypeptides.glp1',
  APPLE_IAP_ENVIRONMENT: 'Sandbox',
} as Env;
const start = Date.parse('2026-11-01T00:00:00Z');
const end = Date.parse('2026-12-01T00:00:00Z');
export const evidence = (): AppleSubscriptionEvidence => ({
  status: 1,
  transaction: {
    productId: 'monthly_29_99',
    bundleId: 'app.mypeptides.glp1',
    environment: 'Sandbox',
    originalTransactionId: '10001',
    transactionId: '10002',
    appAccountToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    type: 'Auto-Renewable Subscription',
    purchaseDate: start,
    expiresDate: end,
    signedDate: start + 1000,
  },
  renewal: { autoRenewStatus: 1 },
});
describe('verified Apple subscription mapping', () => {
  it('maps the purchased monthly subscription with actual Apple expiration', () => {
    expect(appleSubscriptionInput(evidence(), env)).toMatchObject({
      provider: 'APP_STORE',
      providerSubscriptionId: 'apple:Sandbox:10001',
      plan: 'PREMIUM_MONTHLY',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(end),
      cancelAtPeriodEnd: false,
    });
  });
  it.each([
    { productId: 'other' },
    { bundleId: 'other' },
    { environment: 'Production' },
    { type: 'Consumable' },
    { expiresDate: undefined },
    { originalTransactionId: undefined },
  ])('rejects mismatched or incomplete evidence %p', (fields) => {
    const item = evidence();
    Object.assign(item.transaction, fields);
    expect(() => appleSubscriptionInput(item, env)).toThrow();
  });
  it('does not grant expired billing retry subscriptions beyond the paid period', () => {
    const item = evidence();
    item.status = 3;
    expect(appleSubscriptionInput(item, env)).toMatchObject({
      status: 'PAST_DUE',
      currentPeriodEnd: new Date(end),
    });
  });
  it('uses Apple grace expiration, cancellation and refund dates', () => {
    const item = evidence();
    item.status = 4;
    item.renewal = { autoRenewStatus: 0, gracePeriodExpiresDate: end + 86400000 };
    expect(appleSubscriptionInput(item, env)).toMatchObject({
      status: 'PAST_DUE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(end + 86400000),
    });
    item.status = 5;
    item.transaction.revocationDate = start + 5000;
    expect(appleSubscriptionInput(item, env)).toMatchObject({
      status: 'CANCELED',
      currentPeriodEnd: new Date(start + 5000),
    });
  });
  it('maps expiry and rejects unknown status', () => {
    const item = evidence();
    item.status = 2;
    expect(appleSubscriptionInput(item, env).status).toBe('EXPIRED');
    item.status = 99;
    expect(() => appleSubscriptionInput(item, env)).toThrow();
  });
});
