import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { z } from 'zod';
import type { Env } from '../../config';
import type { AppleSubscriptionEvidence } from './apple-store.gateway';

const millis = z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger);
const itemSchema = z.object({
  transaction_id: z.string(),
  original_transaction_id: z.string(),
  product_id: z.string(),
  purchase_date_ms: millis,
  expires_date_ms: millis,
  cancellation_date_ms: millis.optional(),
  is_trial_period: z.enum(['true', 'false']).optional(),
});
const responseSchema = z.object({
  status: z.number().int(),
  environment: z.enum(['Sandbox', 'Production']).optional(),
  receipt: z
    .object({ bundle_id: z.string(), app_item_id: z.number().optional(), request_date_ms: millis })
    .optional(),
  latest_receipt_info: z.array(itemSchema).optional(),
  pending_renewal_info: z
    .array(
      z.object({
        original_transaction_id: z.string(),
        product_id: z.string(),
        auto_renew_status: z.enum(['0', '1']).optional(),
        is_in_billing_retry_period: z.enum(['0', '1']).optional(),
        grace_period_expires_date_ms: millis.optional(),
      }),
    )
    .optional(),
});

/** Shared-secret compatibility path. Never trust an app-supplied receipt without asking Apple. */
export async function verifyAppleReceipt(
  env: Env,
  signed: JWSTransactionDecodedPayload,
  receiptData: string,
): Promise<AppleSubscriptionEvidence> {
  if (!env.APPLE_IAP_SHARED_SECRET)
    throw new ServiceUnavailableException('Apple receipt verifier is not configured');
  if (
    signed.productId !== env.APPLE_IAP_MONTHLY_PRODUCT_ID ||
    signed.bundleId !== env.APPLE_IAP_BUNDLE_ID ||
    signed.environment !== env.APPLE_IAP_ENVIRONMENT
  )
    throw new BadRequestException('Apple signed purchase does not match this app');
  const request = async (url: string) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        'receipt-data': receiptData,
        password: env.APPLE_IAP_SHARED_SECRET,
        'exclude-old-transactions': false,
      }),
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Apple receipt verification unavailable');
    return responseSchema.parse(await response.json());
  };
  let receipt = await request('https://buy.itunes.apple.com/verifyReceipt');
  if (receipt.status === 21007 && env.APPLE_IAP_ENVIRONMENT === 'Sandbox')
    receipt = await request('https://sandbox.itunes.apple.com/verifyReceipt');
  if (![0, 21006].includes(receipt.status))
    throw new ServiceUnavailableException(
      'Apple rejected this receipt or verification configuration',
    );
  if (
    receipt.environment !== env.APPLE_IAP_ENVIRONMENT ||
    receipt.receipt?.bundle_id !== env.APPLE_IAP_BUNDLE_ID ||
    (env.APPLE_IAP_ENVIRONMENT === 'Production' &&
      receipt.receipt.app_item_id !== env.APPLE_IAP_APP_ID)
  )
    throw new BadRequestException('Apple receipt app or environment mismatch');
  const latest = (receipt.latest_receipt_info ?? [])
    .filter(
      (item) =>
        item.original_transaction_id === signed.originalTransactionId &&
        item.product_id === env.APPLE_IAP_MONTHLY_PRODUCT_ID,
    )
    .sort(
      (a, b) => b.purchase_date_ms - a.purchase_date_ms || b.expires_date_ms - a.expires_date_ms,
    )[0];
  if (!latest) throw new BadRequestException('Purchased Apple subscription is absent from receipt');
  const renewal = receipt.pending_renewal_info?.find(
    (item) =>
      item.original_transaction_id === latest.original_transaction_id &&
      item.product_id === latest.product_id,
  );
  const now = receipt.receipt.request_date_ms;
  const grace = renewal?.grace_period_expires_date_ms;
  const status =
    latest.cancellation_date_ms != null
      ? 5
      : receipt.status === 21006
        ? 2
        : grace && grace > now
          ? 4
          : latest.expires_date_ms > now
            ? 1
            : renewal?.is_in_billing_retry_period === '1'
              ? 3
              : 2;
  return {
    status,
    transaction: {
      ...signed,
      transactionId: latest.transaction_id,
      purchaseDate: latest.purchase_date_ms,
      expiresDate: latest.expires_date_ms,
      revocationDate: latest.cancellation_date_ms,
      offerDiscountType: latest.is_trial_period === 'true' ? 'FREE_TRIAL' : undefined,
      signedDate: now,
    },
    renewal: {
      originalTransactionId: latest.original_transaction_id,
      autoRenewStatus:
        renewal?.auto_renew_status == null ? undefined : Number(renewal.auto_renew_status),
      gracePeriodExpiresDate: grace,
      signedDate: now,
    },
  };
}
