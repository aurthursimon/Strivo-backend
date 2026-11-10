import { verifyAppleReceipt } from '../apple-receipt';
const env = {
  APPLE_IAP_SHARED_SECRET: '0'.repeat(32),
  APPLE_IAP_ENVIRONMENT: 'Sandbox',
  APPLE_IAP_APP_ID: 6826407080,
  APPLE_IAP_BUNDLE_ID: 'app.mypeptides.glp1',
  APPLE_IAP_MONTHLY_PRODUCT_ID: 'monthly_29_99',
};
const signed = {
  productId: 'monthly_29_99',
  bundleId: env.APPLE_IAP_BUNDLE_ID,
  environment: 'Sandbox',
  originalTransactionId: '10001',
  transactionId: '10002',
  appAccountToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'Auto-Renewable Subscription',
};
function result() {
  return {
    status: 0,
    environment: 'Sandbox',
    receipt: { bundle_id: env.APPLE_IAP_BUNDLE_ID, request_date_ms: '2000' },
    latest_receipt_info: [
      {
        transaction_id: '10003',
        original_transaction_id: '10001',
        product_id: 'monthly_29_99',
        purchase_date_ms: '1000',
        expires_date_ms: '5000',
        is_trial_period: 'false',
      },
    ],
    pending_renewal_info: [
      { original_transaction_id: '10001', product_id: 'monthly_29_99', auto_renew_status: '1' },
    ],
  };
}
const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => result() });
});
afterAll(() => {
  global.fetch = originalFetch;
});
it('verifies the receipt with Apple and uses the latest renewal, preserving signed ownership', async () => {
  const evidence = await verifyAppleReceipt(env as never, signed, 'app-receipt');
  expect(evidence).toMatchObject({
    status: 1,
    transaction: {
      transactionId: '10003',
      appAccountToken: signed.appAccountToken,
      expiresDate: 5000,
      signedDate: 2000,
    },
  });
  expect(fetchMock.mock.calls[0][0]).toBe('https://buy.itunes.apple.com/verifyReceipt');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    password: env.APPLE_IAP_SHARED_SECRET,
    'receipt-data': 'app-receipt',
    'exclude-old-transactions': false,
  });
});
it('only retries the sandbox URL after Apple returns 21007 and sandbox is configured', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 21007 }) });
  await verifyAppleReceipt(env as never, signed, 'receipt');
  expect(fetchMock.mock.calls[1][0]).toBe('https://sandbox.itunes.apple.com/verifyReceipt');
  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 21007 }) });
  await expect(
    verifyAppleReceipt(
      { ...env, APPLE_IAP_ENVIRONMENT: 'Production' } as never,
      { ...signed, environment: 'Production' },
      'receipt',
    ),
  ).rejects.toThrow('Apple rejected');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each([
  'bundle',
  'product',
  'original',
  'environment',
])('rejects mismatched %s evidence', async (field) => {
  const receipt = result();
  if (field === 'bundle') receipt.receipt.bundle_id = 'other';
  if (field === 'product') receipt.latest_receipt_info[0]!.product_id = 'other';
  if (field === 'original') receipt.latest_receipt_info[0]!.original_transaction_id = 'other';
  if (field === 'environment') receipt.environment = 'Production';
  fetchMock.mockResolvedValue({ ok: true, json: async () => receipt });
  await expect(verifyAppleReceipt(env as never, signed, 'receipt')).rejects.toThrow();
});
it('maps expired and refunded receipts without granting active access', async () => {
  const receipt = result();
  receipt.latest_receipt_info[0]!.expires_date_ms = '1500';
  fetchMock.mockResolvedValue({ ok: true, json: async () => receipt });
  expect((await verifyAppleReceipt(env as never, signed, 'receipt')).status).toBe(2);
  Object.assign(receipt.latest_receipt_info[0]!, { cancellation_date_ms: '1200' });
  expect((await verifyAppleReceipt(env as never, signed, 'receipt')).status).toBe(5);
});
it('uses the server-provided grace expiration and rejects Apple failures', async () => {
  const receipt = result();
  receipt.latest_receipt_info[0]!.expires_date_ms = '1500';
  Object.assign(receipt.pending_renewal_info[0]!, {
    grace_period_expires_date_ms: '6000',
    is_in_billing_retry_period: '1',
  });
  fetchMock.mockResolvedValue({ ok: true, json: async () => receipt });
  expect(await verifyAppleReceipt(env as never, signed, 'receipt')).toMatchObject({
    status: 4,
    renewal: { gracePeriodExpiresDate: 6000 },
  });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 21004 }) });
  await expect(verifyAppleReceipt(env as never, signed, 'receipt')).rejects.toThrow(
    'Apple rejected',
  );
});
