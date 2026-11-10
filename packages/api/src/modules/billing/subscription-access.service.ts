import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { ENV_TOKEN } from '../../config';
import type { Env } from '../../config';
import {
  FREE_DOSE_MAX_MG,
  FREE_MEAL_LOG_LIMIT,
  FREE_SCAN_LIMIT,
  MAX_DAILY_SCAN_LIMIT,
} from './subscription-access';
import { mapPlanToShort } from './billing.serializer';
import { EntitlementService } from './entitlement.service';

export interface FreeTierUsage {
  scansUsed: number;
  scansLimit: number;
  mealLogsUsed: number;
  mealLogsLimit: number;
  doseUsed: boolean;
  doseMaxMg: number;
}

@Injectable()
export class SubscriptionAccessService {
  private readonly entitlementService: EntitlementService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) _env: Env,
    @Optional() entitlementService?: EntitlementService,
  ) {
    this.entitlementService = entitlementService ?? new EntitlementService(prisma);
  }

  isBillingEnforced(): boolean {
    // Missing payment configuration must never grant free premium access.
    return true;
  }

  /** True if the user has a comp/admin flag, short-circuiting every billing gate. */
  async hasCompedAccess(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { compedAccess: true },
    });
    return Boolean(user?.compedAccess);
  }

  async getScanAccess(userId: string): Promise<{ canScan: boolean; dailyLimit: number }> {
    if (await this.hasCompedAccess(userId)) {
      return { canScan: true, dailyLimit: MAX_DAILY_SCAN_LIMIT };
    }
    const enforced = this.isBillingEnforced();
    if (!enforced) {
      return { canScan: true, dailyLimit: MAX_DAILY_SCAN_LIMIT };
    }
    const entitlement = await this.entitlementService.getForUser(userId);
    if (entitlement) {
      const boundedActive =
        entitlement.active &&
        entitlement.validUntil !== null &&
        entitlement.validUntil.getTime() > Date.now();
      if (boundedActive) {
        return { canScan: true, dailyLimit: MAX_DAILY_SCAN_LIMIT };
      }
    }
    return { canScan: false, dailyLimit: 0 };
  }

  /** True if the user's own billing status (comp or paid entitlement) grants full access. */
  async isSubscribed(userId: string): Promise<boolean> {
    return (await this.getStatusPayload(userId)).subscribed;
  }

  async getFreeTierUsage(userId: string): Promise<FreeTierUsage> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { freeScansUsed: true, freeMealLogsUsed: true, freeDoseUsed: true },
    });
    return {
      scansUsed: user?.freeScansUsed ?? 0,
      scansLimit: FREE_SCAN_LIMIT,
      mealLogsUsed: user?.freeMealLogsUsed ?? 0,
      mealLogsLimit: FREE_MEAL_LOG_LIMIT,
      doseUsed: user?.freeDoseUsed ?? false,
      doseMaxMg: FREE_DOSE_MAX_MG,
    };
  }

  /**
   * Atomically consumes one lifetime free meal-log slot. The WHERE clause's
   * own count-below-limit condition (not a read-then-write) is what makes
   * this safe under concurrent requests: only one of two simultaneous calls
   * for a user at the limit can match a row, so `count` tells the caller
   * definitively whether ITS request was the one that consumed the slot.
   */
  async consumeFreeMealLog(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    const result = await tx.user.updateMany({
      where: { id: userId, freeMealLogsUsed: { lt: FREE_MEAL_LOG_LIMIT } },
      data: { freeMealLogsUsed: { increment: 1 } },
    });
    return result.count > 0;
  }

  /** Same atomic-consume pattern as consumeFreeMealLog, for the one-time free dose. */
  async consumeFreeDose(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    const result = await tx.user.updateMany({
      where: { id: userId, freeDoseUsed: false },
      data: { freeDoseUsed: true },
    });
    return result.count > 0;
  }

  /** Same atomic-consume pattern, for the lifetime free AI scan allowance. */
  async consumeFreeScan(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    const result = await tx.user.updateMany({
      where: { id: userId, freeScansUsed: { lt: FREE_SCAN_LIMIT } },
      data: { freeScansUsed: { increment: 1 } },
    });
    return result.count > 0;
  }

  async getStatusPayload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        compedAccess: true,
        freeScansUsed: true,
        freeMealLogsUsed: true,
        freeDoseUsed: true,
      },
    });
    const freeTier: FreeTierUsage = {
      scansUsed: user?.freeScansUsed ?? 0,
      scansLimit: FREE_SCAN_LIMIT,
      mealLogsUsed: user?.freeMealLogsUsed ?? 0,
      mealLogsLimit: FREE_MEAL_LOG_LIMIT,
      doseUsed: user?.freeDoseUsed ?? false,
      doseMaxMg: FREE_DOSE_MAX_MG,
    };
    if (user?.compedAccess) {
      return {
        billingEnforced: this.isBillingEnforced(),
        subscribed: true,
        hasSubscription: true,
        status: null,
        plan: 'COMP' as const,
        trialEnd: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        dailyScanLimit: MAX_DAILY_SCAN_LIMIT,
        canScan: true,
        provider: null,
        managementProvider: 'NONE' as const,
        entitlementValidUntil: null,
        inGracePeriod: false,
        entitlementVersion: 1,
        freeTier,
      };
    }
    const enforced = this.isBillingEnforced();
    const entitlement = await this.entitlementService.getForUser(userId);
    if (entitlement) {
      const subscribed =
        entitlement.active &&
        entitlement.validUntil !== null &&
        entitlement.validUntil.getTime() > Date.now();
      const canScan = !enforced || subscribed;
      return {
        billingEnforced: enforced,
        subscribed,
        hasSubscription: subscribed,
        status: entitlement.status,
        plan: mapPlanToShort(entitlement.plan),
        trialEnd: entitlement.trialEnd?.toISOString() ?? null,
        trialEndsAt: entitlement.trialEnd?.toISOString() ?? null,
        currentPeriodEnd: entitlement.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
        dailyScanLimit: canScan ? MAX_DAILY_SCAN_LIMIT : 0,
        canScan,
        provider: entitlement.sourceProvider,
        managementProvider: entitlement.managementProvider,
        entitlementValidUntil: entitlement.validUntil?.toISOString() ?? null,
        inGracePeriod: entitlement.inGracePeriod,
        entitlementVersion: entitlement.version,
        freeTier,
      };
    }
    return {
      billingEnforced: enforced,
      subscribed: false,
      hasSubscription: false,
      status: null,
      plan: null,
      trialEnd: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      freeTier,
      dailyScanLimit: enforced ? 0 : MAX_DAILY_SCAN_LIMIT,
      canScan: !enforced,
      provider: null,
      managementProvider: 'NONE' as const,
      entitlementValidUntil: null,
      inGracePeriod: false,
      entitlementVersion: 1,
    };
  }

}
