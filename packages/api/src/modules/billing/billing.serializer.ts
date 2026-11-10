/**
 * Helpers puros de billing status (DB enums -> shape app).
 *
 * Contrato D1: o banco mantem os enums canonicos (PlanType PREMIUM_*,
 * SubscriptionStatus). A adaptacao para o shape do app (plan curto MONTHLY/YEARLY,
 * flag subscribed) acontece SO na borda. Funcoes puras, sem dependencia de
 * Nest/Prisma runtime. Apenas import type de @prisma/client.
 */
import type { PlanType } from '@prisma/client';

/** PlanType do DB -> forma curta usada pelo app. */
export function mapPlanToShort(plan: PlanType | null): 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null {
  switch (plan) {
    case 'PREMIUM_WEEKLY':
      return 'WEEKLY';
    case 'PREMIUM_MONTHLY':
      return 'MONTHLY';
    case 'PREMIUM_YEARLY':
      return 'YEARLY';
    default:
      return null;
  }
}
