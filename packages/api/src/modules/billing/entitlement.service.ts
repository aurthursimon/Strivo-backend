import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingManagementProvider,
  BillingProvider,
  PlanType,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma';

const ACCESS_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
]);

const PROVIDER_PRECEDENCE: Record<BillingProvider, number> = {
  [BillingProvider.APP_STORE]: 3,
  [BillingProvider.PLAY_STORE]: 2,
  [BillingProvider.REVENUECAT_UNKNOWN]: 1,
  [BillingProvider.STRIPE]: 3,
};

const NATIVE_STORE_PROVIDERS = [
  BillingProvider.APP_STORE,
  BillingProvider.PLAY_STORE,
  BillingProvider.REVENUECAT_UNKNOWN,
] as const;

export interface ProviderSubscriptionInput {
  provider: BillingProvider;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerPriceId?: string | null;
  currency?: string | null;
  market?: string | null;
  amount?: number | null;
  interval?: string | null;
  providerOriginalTransactionId: string | null;
  providerStore: string | null;
  providerEnvironment: string | null;
  status: SubscriptionStatus;
  plan: PlanType;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  sourceUpdatedAt: Date;
  rawVersion: number;
  legacySubscriptionId?: string | null;
}

export interface TrialUseInput {
  provider: BillingProvider;
  startedAt: Date;
  sourceSubscriptionId: string | null;
}

type ProviderRow = {
  id: string;
  provider: BillingProvider;
  status: SubscriptionStatus;
  plan: PlanType;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  sourceUpdatedAt: Date;
  updatedAt: Date;
};

export interface PremiumEntitlementSnapshot {
  billingSubjectId: string;
  active: boolean;
  inGracePeriod: boolean;
  validUntil: Date | null;
  managementProvider: BillingManagementProvider;
  sourceProvider: BillingProvider | null;
  status: SubscriptionStatus | null;
  plan: PlanType | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  version: number;
  derivedAt: Date;
}

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureBillingSubject(userId: string): Promise<string> {
    return this.prisma.$transaction((tx) => this.lockUserAndResolveSubject(tx, userId));
  }

  async getForUser(userId: string) {
    const delegate = this.prisma.premiumEntitlement;
    if (!delegate) return null;
    return delegate.findFirst({
      where: { billingSubject: { userId } },
    });
  }

  async recomputeForUser(userId: string, derivedAt = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const billingSubjectId = await this.lockUserAndResolveSubject(tx, userId);
      return this.deriveAndPersist(tx, userId, billingSubjectId, derivedAt);
    });
  }

  async upsertProviderSubscription(
    userId: string,
    input: ProviderSubscriptionInput,
    derivedAt = new Date(),
  ) {
    return this.prisma.$transaction((tx) =>
      this.upsertProviderSubscriptionInTransaction(tx, userId, input, derivedAt),
    );
  }

  async upsertProviderSubscriptionInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    input: ProviderSubscriptionInput,
    derivedAt = new Date(),
  ) {
    const billingSubjectId = await this.lockUserAndResolveSubject(tx, userId);
    const result = await this.upsertProviderRow(tx, billingSubjectId, input);
    if (!result.applied) {
      return { ...result, billingSubjectId, entitlement: null };
    }

    if (input.trialStart || input.trialEnd) {
      await tx.premiumTrialUse.upsert({
        where: { billingSubjectId },
        create: {
          billingSubjectId,
          firstProvider: input.provider,
          startedAt: input.trialStart ?? input.trialEnd!,
          sourceSubscriptionId: input.providerSubscriptionId,
        },
        update: {},
      });
    }

    const entitlement = await this.deriveAndPersist(tx, userId, billingSubjectId, derivedAt);
    return { ...result, billingSubjectId, entitlement };
  }

  async seedTrialUse(userId: string, input: TrialUseInput) {
    return this.prisma.$transaction(async (tx) => {
      const billingSubjectId = await this.lockUserAndResolveSubject(tx, userId);
      return tx.premiumTrialUse.upsert({
        where: { billingSubjectId },
        create: {
          billingSubjectId,
          firstProvider: input.provider,
          startedAt: input.startedAt,
          sourceSubscriptionId: input.sourceSubscriptionId,
        },
        update: {},
      });
    });
  }

  async reconcileStoreProviderSubscriptions(
    userId: string,
    inputs: ProviderSubscriptionInput[],
    sourceUpdatedAt: Date,
    sourceVersionMs: number,
  ) {
    const rawVersion = Math.max(1, Math.min(2_147_483_647, Math.floor(sourceVersionMs / 1000)));
    const normalizedInputs = inputs.map((input) => ({
      ...input,
      sourceUpdatedAt,
      rawVersion,
    }));

    return this.prisma.$transaction(async (tx) => {
      const billingSubjectId = await this.lockUserAndResolveSubject(tx, userId);
      const desiredIdentities = new Set(
        normalizedInputs.map((input) => `${input.provider}:${input.providerSubscriptionId}`),
      );
      const existing = await tx.billingSubscription.findMany({
        where: {
          billingSubjectId,
          provider: { in: [...NATIVE_STORE_PROVIDERS] },
        },
        select: {
          id: true,
          provider: true,
          providerSubscriptionId: true,
          sourceUpdatedAt: true,
          rawVersion: true,
        },
      });

      for (const row of existing) {
        const identity = `${row.provider}:${row.providerSubscriptionId}`;
        if (desiredIdentities.has(identity)) continue;
        const isNewer =
          row.sourceUpdatedAt.getTime() > sourceUpdatedAt.getTime() ||
          (row.sourceUpdatedAt.getTime() === sourceUpdatedAt.getTime() &&
            row.rawVersion >= rawVersion);
        if (isNewer) continue;
        await tx.billingSubscription.updateMany({
          where: { id: row.id, billingSubjectId },
          data: {
            status: SubscriptionStatus.EXPIRED,
            cancelAtPeriodEnd: false,
            canceledAt: sourceUpdatedAt,
            sourceUpdatedAt,
            rawVersion,
          },
        });
      }

      const results = [];
      for (const input of normalizedInputs) {
        const result = await this.upsertProviderRow(tx, billingSubjectId, input);
        results.push(result);
        if (result.applied && (input.trialStart || input.trialEnd)) {
          await tx.premiumTrialUse.upsert({
            where: { billingSubjectId },
            create: {
              billingSubjectId,
              firstProvider: input.provider,
              startedAt: input.trialStart ?? input.trialEnd!,
              sourceSubscriptionId: input.providerSubscriptionId,
            },
            update: {},
          });
        }
      }

      const entitlement = await this.deriveAndPersist(
        tx,
        userId,
        billingSubjectId,
        sourceUpdatedAt,
      );
      return { billingSubjectId, entitlement, results };
    });
  }

  private async lockUserAndResolveSubject(tx: Prisma.TransactionClient, userId: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!locked[0]) throw new NotFoundException('Usuario nao encontrado');

    const subject = await tx.billingSubject.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return subject.id;
  }

  private async upsertProviderRow(
    tx: Prisma.TransactionClient,
    billingSubjectId: string,
    input: ProviderSubscriptionInput,
  ) {
    const providerIdentity = {
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
    };
    const existing = await tx.billingSubscription.findUnique({
      where: { provider_providerSubscriptionId: providerIdentity },
      select: {
        id: true,
        billingSubjectId: true,
        sourceUpdatedAt: true,
        rawVersion: true,
      },
    });
    if (existing && existing.billingSubjectId !== billingSubjectId) {
      throw new ConflictException('A assinatura informada pertence a outro titular de cobranca.');
    }
    if (
      existing &&
      (existing.sourceUpdatedAt.getTime() > input.sourceUpdatedAt.getTime() ||
        (existing.sourceUpdatedAt.getTime() === input.sourceUpdatedAt.getTime() &&
          existing.rawVersion >= input.rawVersion))
    ) {
      return { applied: false as const, subscription: existing };
    }

    const mutable = {
      providerCustomerId: input.providerCustomerId,
      providerPriceId: input.providerPriceId ?? null,
      currency: input.currency ?? null,
      market: input.market ?? null,
      amount: input.amount ?? null,
      interval: input.interval ?? null,
      providerOriginalTransactionId: input.providerOriginalTransactionId,
      providerStore: input.providerStore,
      providerEnvironment: input.providerEnvironment,
      status: input.status,
      plan: input.plan,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      trialStart: input.trialStart,
      trialEnd: input.trialEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      canceledAt: input.canceledAt,
      sourceUpdatedAt: input.sourceUpdatedAt,
      rawVersion: input.rawVersion,
      legacySubscriptionId: input.legacySubscriptionId ?? null,
    };
    const subscription = await tx.billingSubscription.upsert({
      where: { provider_providerSubscriptionId: providerIdentity },
      create: {
        billingSubjectId,
        ...providerIdentity,
        ...mutable,
      },
      update: mutable,
    });
    return { applied: true as const, subscription };
  }

  private async deriveAndPersist(
    tx: Prisma.TransactionClient,
    userId: string,
    billingSubjectId: string,
    derivedAt: Date,
  ): Promise<PremiumEntitlementSnapshot> {
    const [user, providerRows] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { compedAccess: true },
      }),
      tx.billingSubscription.findMany({
        where: { billingSubjectId },
        select: {
          id: true,
          provider: true,
          status: true,
          plan: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          trialStart: true,
          trialEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          sourceUpdatedAt: true,
          updatedAt: true,
        },
      }),
    ]);
    if (!user) throw new NotFoundException('Usuario nao encontrado');

    const winner = this.selectAccessWinner(providerRows, derivedAt);
    const snapshot: PremiumEntitlementSnapshot = user.compedAccess
      ? {
          billingSubjectId,
          active: true,
          inGracePeriod: false,
          validUntil: null,
          managementProvider: BillingManagementProvider.NONE,
          sourceProvider: null,
          status: null,
          plan: null,
          trialEnd: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          version: 1,
          derivedAt,
        }
      : winner
        ? {
            billingSubjectId,
            active: true,
            inGracePeriod: winner.status === SubscriptionStatus.PAST_DUE,
            validUntil: winner.currentPeriodEnd,
            managementProvider: this.toManagementProvider(winner.provider),
            sourceProvider: winner.provider,
            status: winner.status,
            plan: winner.plan,
            trialEnd: winner.trialEnd,
            currentPeriodEnd: winner.currentPeriodEnd,
            cancelAtPeriodEnd: winner.cancelAtPeriodEnd,
            version: 1,
            derivedAt,
          }
        : {
            billingSubjectId,
            active: false,
            inGracePeriod: false,
            validUntil: null,
            managementProvider: BillingManagementProvider.NONE,
            sourceProvider: null,
            status: null,
            plan: null,
            trialEnd: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            version: 1,
            derivedAt,
          };

    await tx.premiumEntitlement.upsert({
      where: { billingSubjectId },
      create: snapshot,
      update: snapshot,
    });
    return snapshot;
  }

  private selectAccessWinner(rows: ProviderRow[], now: Date): ProviderRow | null {
    const valid = rows.filter(
      (row) => ACCESS_STATUSES.has(row.status) && row.currentPeriodEnd.getTime() > now.getTime(),
    );
    valid.sort((left, right) => {
      const boundary = right.currentPeriodEnd.getTime() - left.currentPeriodEnd.getTime();
      if (boundary !== 0) return boundary;
      const provider = PROVIDER_PRECEDENCE[right.provider] - PROVIDER_PRECEDENCE[left.provider];
      if (provider !== 0) return provider;
      const source = right.sourceUpdatedAt.getTime() - left.sourceUpdatedAt.getTime();
      if (source !== 0) return source;
      return left.id.localeCompare(right.id);
    });
    return valid[0] ?? null;
  }

  private toManagementProvider(provider: BillingProvider): BillingManagementProvider {
    switch (provider) {
      case BillingProvider.APP_STORE:
        return BillingManagementProvider.APP_STORE;
      case BillingProvider.PLAY_STORE:
        return BillingManagementProvider.PLAY_STORE;
      case BillingProvider.STRIPE:
        return BillingManagementProvider.STRIPE;
      case BillingProvider.REVENUECAT_UNKNOWN:
      default:
        return BillingManagementProvider.REVENUECAT_UNKNOWN;
    }
  }
}
