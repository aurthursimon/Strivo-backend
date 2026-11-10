import { BadRequestException } from '@nestjs/common';
import { BillingProvider, PlanType, SubscriptionStatus } from '@prisma/client';
import type { Env } from '../../config';
import type { ProviderSubscriptionInput } from './entitlement.service';
import type { AppleSubscriptionEvidence } from './apple-store.gateway';

export function appleSubscriptionInput(
  evidence: AppleSubscriptionEvidence,
  env: Env,
): ProviderSubscriptionInput {
  const { transaction: tx, renewal, status } = evidence;
  if (![1, 2, 3, 4, 5].includes(status))
    throw new BadRequestException('Unknown Apple subscription status');
  if (
    tx.productId !== env.APPLE_IAP_MONTHLY_PRODUCT_ID ||
    tx.bundleId !== env.APPLE_IAP_BUNDLE_ID ||
    tx.environment !== env.APPLE_IAP_ENVIRONMENT ||
    !tx.originalTransactionId ||
    !Number.isFinite(tx.purchaseDate) ||
    !Number.isFinite(tx.expiresDate)
  )
    throw new BadRequestException('Apple subscription does not match this app');
  if (tx.type !== 'Auto-Renewable Subscription')
    throw new BadRequestException('Apple product is not an auto-renewable subscription');
  const revoked = tx.revocationDate != null || status === 5;
  const graceEnd = status === 4 ? renewal?.gracePeriodExpiresDate : undefined;
  const periodEnd = revoked
    ? Math.min(tx.expiresDate!, tx.revocationDate ?? tx.expiresDate!)
    : Math.max(tx.expiresDate!, graceEnd ?? 0);
  const trial = tx.offerDiscountType === 'FREE_TRIAL';
  return {
    provider: BillingProvider.APP_STORE,
    providerSubscriptionId: `apple:${env.APPLE_IAP_ENVIRONMENT}:${tx.originalTransactionId}`,
    providerCustomerId: tx.appAccountToken ?? null,
    providerPriceId: tx.productId,
    providerOriginalTransactionId: tx.originalTransactionId,
    providerStore: 'APP_STORE',
    providerEnvironment: env.APPLE_IAP_ENVIRONMENT,
    plan: PlanType.PREMIUM_MONTHLY,
    status: revoked
      ? SubscriptionStatus.CANCELED
      : status === 2
        ? SubscriptionStatus.EXPIRED
        : status === 3 || status === 4
          ? SubscriptionStatus.PAST_DUE
          : trial
            ? SubscriptionStatus.TRIALING
            : SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(tx.purchaseDate!),
    currentPeriodEnd: new Date(periodEnd),
    trialStart: trial ? new Date(tx.purchaseDate!) : null,
    trialEnd: trial ? new Date(tx.expiresDate!) : null,
    cancelAtPeriodEnd: renewal?.autoRenewStatus === 0,
    canceledAt: tx.revocationDate ? new Date(tx.revocationDate) : null,
    sourceUpdatedAt: new Date(
      Math.max(tx.signedDate ?? tx.purchaseDate!, renewal?.signedDate ?? 0),
    ),
    rawVersion: 1,
  };
}
