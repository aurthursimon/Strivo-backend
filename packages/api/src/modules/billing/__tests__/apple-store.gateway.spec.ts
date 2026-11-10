import { AppleStoreGateway } from '../apple-store.gateway';
function setup() {
  const submitted = { originalTransactionId: '10001', transactionId: '10002', signedDate: 1 };
  const latest = { ...submitted, transactionId: '10003', revocationDate: 200, signedDate: 300 };
  const client = {
    getTransactionInfo: jest.fn().mockResolvedValue({ signedTransactionInfo: 'old' }),
    getAllSubscriptionStatuses: jest
      .fn()
      .mockResolvedValue({
        data: [
          {
            lastTransactions: [
              {
                originalTransactionId: '10001',
                status: 5,
                signedTransactionInfo: 'latest',
                signedRenewalInfo: 'renewal',
              },
            ],
          },
        ],
      }),
  };
  const verifier = {
    verifyAndDecodeTransaction: jest.fn(async (jws: string) =>
      jws === 'old' ? submitted : latest,
    ),
    verifyAndDecodeRenewalInfo: jest
      .fn()
      .mockResolvedValue({ originalTransactionId: '10001', signedDate: 300 }),
  };
  const gateway = new AppleStoreGateway({} as never);
  Object.assign(gateway, { sdk: { client, verifier } });
  return { gateway, client, verifier };
}
it('fetches authoritative current status so replaying a pre-refund transaction cannot revive access', async () => {
  const s = setup();
  await expect(s.gateway.latest('10002')).resolves.toMatchObject({
    status: 5,
    transaction: { transactionId: '10003', revocationDate: 200 },
  });
  expect(s.client.getAllSubscriptionStatuses).toHaveBeenCalledWith('10001');
  expect(s.verifier.verifyAndDecodeTransaction).toHaveBeenCalledWith('latest');
  expect(s.verifier.verifyAndDecodeRenewalInfo).toHaveBeenCalledWith('renewal');
});
it('rejects a substituted original transaction in signed status evidence', async () => {
  const s = setup();
  s.verifier.verifyAndDecodeRenewalInfo.mockResolvedValue({ originalTransactionId: 'other' });
  await expect(s.gateway.latest('10002')).rejects.toThrow('renewal identity mismatch');
});
it('fails closed if Apple cannot verify a status transaction', async () => {
  const s = setup();
  s.verifier.verifyAndDecodeTransaction.mockRejectedValue(new Error('invalid signature'));
  await expect(s.gateway.latest('10002')).rejects.toThrow('verification unavailable');
});
it('bounds a stalled Apple request without applying a late result', async () => {
  jest.useFakeTimers();
  try {
    const s = setup();
    s.client.getTransactionInfo.mockReturnValue(new Promise(() => {}));
    const result = expect(s.gateway.latest('10002')).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(10_000);
    await result;
  } finally {
    jest.useRealTimers();
  }
});
