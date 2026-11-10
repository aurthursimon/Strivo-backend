import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BillingProvider } from '@prisma/client';
import { ENV_TOKEN, type Env } from '../../config';
import { PrismaService } from '../../prisma';
import { EntitlementService } from './entitlement.service';
import { SubscriptionAccessService } from './subscription-access.service';
import {
  APPLE_STORE_GATEWAY,
  appleStoreConfigured,
  appleServerApiConfigured,
  type AppleStoreGatewayPort,
  type AppleSubscriptionEvidence,
} from './apple-store.gateway';
import { appleSubscriptionInput } from './apple-subscription.mapper';

@Injectable()
export class AppleStoreService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(APPLE_STORE_GATEWAY) private readonly apple: AppleStoreGatewayPort,
    private readonly entitlement: EntitlementService,
    private readonly access: SubscriptionAccessService,
  ) {}
  private requireConfig() {
    if (!appleStoreConfigured(this.env))
      throw new ServiceUnavailableException('Apple purchases are not configured');
  }
  async accountToken(userId: string) {
    this.requireConfig();
    return {
      appAccountToken: await this.entitlement.ensureBillingSubject(userId),
      verificationMode: appleServerApiConfigured(this.env) ? 'server-api' : 'receipt',
    };
  }
  private async apply(userId: string, evidence: AppleSubscriptionEvidence) {
    const input = appleSubscriptionInput(evidence, this.env);
    const subjectId = await this.entitlement.ensureBillingSubject(userId);
    if (evidence.transaction.appAccountToken) {
      if (evidence.transaction.appAccountToken.toLowerCase() !== subjectId.toLowerCase())
        throw new ForbiddenException('This purchase belongs to another account');
    } else {
      const known = await this.prisma.billingSubscription.findUnique({
        where: {
          provider_providerSubscriptionId: {
            provider: BillingProvider.APP_STORE,
            providerSubscriptionId: input.providerSubscriptionId,
          },
        },
      });
      if (!known || known.billingSubjectId !== subjectId)
        throw new ForbiddenException('Unlinked Apple purchase');
    }
    await this.entitlement.upsertProviderSubscription(userId, input);
  }
  async verify(
    userId: string,
    transactionId: string,
    receiptData?: string,
    signedTransaction?: string,
  ) {
    this.requireConfig();
    if (
      !appleServerApiConfigured(this.env) &&
      (!receiptData || !signedTransaction || !this.apple.receipt)
    )
      throw new BadRequestException('Apple receipt and signed transaction are required');
    const evidence = appleServerApiConfigured(this.env)
      ? await this.apple.latest(transactionId)
      : await this.apple.receipt!(transactionId, receiptData!, signedTransaction!);
    await this.apply(userId, evidence);
    return this.access.getStatusPayload(userId);
  }
  async reconcile(userId: string) {
    this.requireConfig();
    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: {
        provider: BillingProvider.APP_STORE,
        providerEnvironment: this.env.APPLE_IAP_ENVIRONMENT,
        billingSubject: { userId },
      },
    });
    for (const subscription of appleServerApiConfigured(this.env) ? subscriptions : []) {
      if (subscription.providerOriginalTransactionId)
        await this.apply(
          userId,
          await this.apple.latest(subscription.providerOriginalTransactionId),
        );
    }
    return this.access.getStatusPayload(userId);
  }
  async notification(signedPayload: string) {
    this.requireConfig();
    const notification = await this.apple.notification(signedPayload);
    if (!notification.notificationUUID)
      throw new BadRequestException('Apple notification identity missing');
    // Reuse the historical provider-event ledger; no RevenueCat service or API is called.
    const id = `apple:${notification.notificationUUID}`;
    const processed = await this.prisma.revenueCatWebhookEvent.findUnique({ where: { id } });
    if (processed?.status === 'PROCESSED') return { received: true as const };
    const signed = notification.data?.signedTransactionInfo;
    if (signed) {
      const transaction = await this.apple.transaction(signed);
      if (
        transaction.productId === this.env.APPLE_IAP_MONTHLY_PRODUCT_ID &&
        transaction.originalTransactionId
      ) {
        let userId: string | null = null;
        if (transaction.appAccountToken) {
          const subject = await this.prisma.billingSubject.findUnique({
            where: { id: transaction.appAccountToken },
          });
          userId = subject?.userId ?? null;
        } else {
          const known = await this.prisma.billingSubscription.findUnique({
            where: {
              provider_providerSubscriptionId: {
                provider: BillingProvider.APP_STORE,
                providerSubscriptionId: `apple:${this.env.APPLE_IAP_ENVIRONMENT}:${transaction.originalTransactionId}`,
              },
            },
            include: { billingSubject: true },
          });
          userId = known?.billingSubject.userId ?? null;
        }
        // Detached billing evidence is retained after account deletion, never transferred.
        if (userId) {
          if (appleServerApiConfigured(this.env)) {
            await this.apply(userId, await this.apple.latest(transaction.originalTransactionId));
          } else {
            const status = notification.data?.status;
            if (status == null || ![1, 2, 3, 4, 5].includes(status))
              throw new BadRequestException('Apple notification subscription status missing');
            const renewal =
              notification.data?.signedRenewalInfo && this.apple.renewal
                ? await this.apple.renewal(notification.data.signedRenewalInfo)
                : undefined;
            if (
              renewal?.originalTransactionId &&
              renewal.originalTransactionId !== transaction.originalTransactionId
            )
              throw new BadRequestException('Apple renewal identity mismatch');
            // Signed notifications carry authoritative status; the source timestamp rejects stale deliveries.
            await this.apply(userId, {
              transaction: {
                ...transaction,
                signedDate: Math.max(transaction.signedDate ?? 0, notification.signedDate ?? 0),
              },
              renewal,
              status,
            });
          }
        }
      }
    }
    await this.prisma.revenueCatWebhookEvent.upsert({
      where: { id },
      create: {
        id,
        type: notification.notificationType ?? 'UNKNOWN',
        status: 'PROCESSED',
        processedAt: new Date(),
      },
      update: { status: 'PROCESSED', error: null, processedAt: new Date() },
    });
    return { received: true as const };
  }
}
