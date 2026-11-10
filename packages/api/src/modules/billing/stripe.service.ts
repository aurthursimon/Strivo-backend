import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { BillingProvider, PlanType, SubscriptionStatus } from '@prisma/client';
import { ENV_TOKEN, type Env } from '../../config';
import { PrismaService } from '../../prisma';
import { EntitlementService, type ProviderSubscriptionInput } from './entitlement.service';
import { MetaCapiService } from './meta-capi.service';
import type { StripeMarket, StripePlan, StripeReturnContext } from './dto/create-stripe-checkout.dto';

export const STRIPE_FETCH = Symbol('STRIPE_FETCH');
export type StripeClient = Stripe;

const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
// Product owner decision (set/2026, superseding both the original "anual +
// 14 dias gratis" doc AND the later "4 on monthly/yearly, 3 on weekly"
// version): the Stripe trial is the SAME 3 days already promised on
// TrialCelebrationPage right after onboarding (TRIAL_ACCESS_DAYS in
// subscription-access.ts) - not extra days stacked on top of it. Every plan
// gets this one number.
const CHECKOUT_TRIAL_DAYS = 3;

function planTypeForStripePlan(plan: StripePlan): PlanType {
  if (plan === 'weekly') return PlanType.PREMIUM_WEEKLY;
  return plan === 'monthly' ? PlanType.PREMIUM_MONTHLY : PlanType.PREMIUM_YEARLY;
}

function stripePriceEnvSuffix(plan: StripePlan): 'WEEKLY' | 'MONTHLY' | 'YEARLY' {
  if (plan === 'weekly') return 'WEEKLY';
  return plan === 'monthly' ? 'MONTHLY' : 'YEARLY';
}

function currencyForMarket(market: StripeMarket): string {
  return {
    US: 'USD',
    CA: 'CAD',
    GB: 'GBP',
    DE: 'EUR',
    FR: 'EUR',
    ES: 'EUR',
    PH: 'PHP',
    IN: 'INR',
  }[market];
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  if (status === 'trialing') return SubscriptionStatus.TRIALING;
  if (status === 'active') return SubscriptionStatus.ACTIVE;
  if (status === 'past_due') return SubscriptionStatus.PAST_DUE;
  if (status === 'canceled') return SubscriptionStatus.CANCELED;
  if (status === 'incomplete') return SubscriptionStatus.INCOMPLETE;
  return SubscriptionStatus.EXPIRED;
}

export function mapStripePriceToPlan(
  priceId: string | undefined,
  monthlyPriceId: string | undefined,
  yearlyPriceId: string | undefined,
): PlanType {
  if (priceId && priceId === monthlyPriceId) return PlanType.PREMIUM_MONTHLY;
  if (priceId && priceId === yearlyPriceId) return PlanType.PREMIUM_YEARLY;
  throw new ConflictException('Stripe price nao reconhecido');
}

@Injectable()
export class StripeService {
  private readonly stripe?: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementService: EntitlementService,
    private readonly metaCapi: MetaCapiService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {
    if (env.STRIPE_ENABLED && env.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(env.STRIPE_SECRET_KEY);
    }
  }

  isConfigured(): boolean {
    return Boolean(
      this.env.STRIPE_ENABLED &&
      this.env.STRIPE_SECRET_KEY &&
      this.env.STRIPE_WEBHOOK_SECRET &&
      this.priceForMarket('US', 'monthly') &&
      this.priceForMarket('US', 'yearly'),
    );
  }

  private requireConfigured(): Stripe {
    if (!this.isConfigured() || !this.stripe) {
      throw new ServiceUnavailableException('Stripe nao configurado no backend');
    }
    return this.stripe;
  }

  /**
   * Fluxo principal: checkout sempre autenticado. O userId vem do JWT
   * (controller passa @CurrentUser().sub) — nunca do body. O e-mail usado no
   * Stripe Customer vem do registro do usuario no banco, nunca de um valor
   * enviado pelo cliente. O BillingSubject e sempre resolvido/criado ja
   * vinculado a esse userId (nunca orfao), entao o webhook consegue
   * sincronizar a assinatura no primeiro evento, sem depender de /claim.
   */
  async createCheckoutSession(
    userId: string,
    plan: StripePlan,
    market: StripeMarket,
    requestedIdempotencyKey?: string,
    returnContext: StripeReturnContext = 'site',
  ): Promise<{ id: string; url: string | null }> {
    const stripe = this.requireConfigured();
    const priceId = this.priceForMarket(market, plan);
    const canonicalPlan = planTypeForStripePlan(plan);
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { email: true },
    });
    if (!user?.email) {
      throw new ConflictException('Usuario autenticado nao possui e-mail cadastrado');
    }
    const email = user.email;
    const subject = await this.prisma.billingSubject.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    const idempotencyKey =
      requestedIdempotencyKey ?? `checkout:${subject.id}:${market}:${plan}:${returnContext}`;
    const existing = await this.prisma.stripeCheckoutAttempt.findUnique({
      where: { billingSubjectId_idempotencyKey: { billingSubjectId: subject.id, idempotencyKey } },
      select: { checkoutSessionId: true },
    });
    if (existing?.checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(existing.checkoutSessionId);
      return { id: session.id, url: session.url };
    }

    const previousStripe = await this.prisma.billingSubscription.findFirst({
      where: { billingSubjectId: subject.id, provider: BillingProvider.STRIPE },
      select: { providerCustomerId: true },
      orderBy: { updatedAt: 'desc' },
    });
    const attempt = await this.prisma.stripeCheckoutAttempt.upsert({
      where: { billingSubjectId_idempotencyKey: { billingSubjectId: subject.id, idempotencyKey } },
      create: {
        billingSubjectId: subject.id,
        idempotencyKey,
        plan: canonicalPlan,
        market,
        currency: currencyForMarket(market),
        priceId,
      },
      update: { plan: canonicalPlan, market, currency: currencyForMarket(market), priceId },
      select: { id: true, checkoutSessionId: true },
    });
    if (attempt.checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(attempt.checkoutSessionId);
      return { id: session.id, url: session.url };
    }

    let customerId = previousStripe?.providerCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email,
          metadata: { billingSubjectId: subject.id, userId },
        },
        { idempotencyKey: `customer:${subject.id}` },
      );
      customerId = customer.id;
    }

    const isAppContext = returnContext === 'app' || returnContext === 'app-upgrade';
    const returnQuery = isAppContext ? '&context=app' : '';
    // The app requires immediate subscription; web-funnel offers remain separate.
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: subject.id,
        success_url:
          this.env.FRONTEND_URL +
          '/billing/success?session_id={CHECKOUT_SESSION_ID}' +
          returnQuery,
        cancel_url: this.env.FRONTEND_URL + '/billing/cancel' + (isAppContext ? '?context=app' : ''),
        metadata: { billingSubjectId: subject.id, userId, plan, market },
        subscription_data: {
          metadata: { billingSubjectId: subject.id, userId, plan, market },
          ...(isAppContext ? {} : { trial_period_days: CHECKOUT_TRIAL_DAYS }),
        },
      },
      { idempotencyKey },
    );
    await this.prisma.stripeCheckoutAttempt.update({
      where: { id: attempt.id },
      data: { checkoutSessionId: session.id, stripeCustomerId: customerId },
    });
    return { id: session.id, url: session.url };
  }

  async claimCheckoutSession(userId: string, claimToken: string): Promise<void> {
    const stripe = this.requireConfigured();
    const attempt = await this.prisma.stripeCheckoutAttempt.findUnique({
      where: { claimTokenHash: this.hashClaimToken(claimToken) },
      include: { billingSubject: true },
    });
    if (!attempt || !attempt.claimExpiresAt || attempt.claimExpiresAt < new Date()) {
      throw new ConflictException('Token de claim Stripe invalido ou expirado');
    }
    if (attempt.claimedAt) {
      throw new ConflictException('Token de claim Stripe ja utilizado');
    }
    const sessionId = attempt.checkoutSessionId;
    if (!sessionId) throw new ConflictException('Checkout Stripe ainda nao foi criado');
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] });
    let customerEmail: string | null | undefined;
    if (typeof session.customer === 'string') {
      const customer = await stripe.customers.retrieve(session.customer);
      customerEmail = 'deleted' in customer && customer.deleted ? null : customer.email;
    } else if (session.customer && !('deleted' in session.customer && session.customer.deleted)) {
      customerEmail = session.customer.email;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (
      !user?.email ||
      !customerEmail ||
      user.email.trim().toLowerCase() !== customerEmail.trim().toLowerCase()
    ) {
      throw new ConflictException('O checkout Stripe nao pertence ao e-mail desta conta');
    }
    if (session.metadata?.billingSubjectId !== attempt.billingSubjectId) {
      throw new ConflictException('Checkout Stripe nao corresponde ao titular esperado');
    }
    if (session.payment_status !== 'paid' || !session.subscription) {
      throw new ConflictException('Checkout Stripe ainda nao possui pagamento confirmado');
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.billingSubject.updateMany({
        where: { id: attempt.billingSubjectId, userId: null },
        data: { userId },
      });
      if (claimed.count === 0) {
        const current = await tx.billingSubject.findUnique({
          where: { id: attempt.billingSubjectId },
          select: { userId: true },
        });
        if (current?.userId !== userId)
          throw new ConflictException('Checkout Stripe ja associado a outra conta');
      }
      const marked = await tx.stripeCheckoutAttempt.updateMany({
        where: { id: attempt.id, claimedAt: null },
        data: { claimedAt: new Date() },
      });
      if (marked.count !== 1) {
        throw new ConflictException('Token de claim Stripe ja utilizado');
      }
    });
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    await this.syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
  }

  private hashClaimToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async rotateClaimToken(checkoutSessionId: string): Promise<string> {
    const claimToken = randomBytes(32).toString('base64url');
    await this.prisma.stripeCheckoutAttempt.update({
      where: { checkoutSessionId },
      data: {
        claimTokenHash: this.hashClaimToken(claimToken),
        claimExpiresAt: new Date(Date.now() + CLAIM_TTL_MS),
      },
    });
    return claimToken;
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const stripe = this.requireConfigured();
    if (!signature || !this.env.STRIPE_WEBHOOK_SECRET) {
      throw new ConflictException('Assinatura Stripe ausente');
    }
    return stripe.webhooks.constructEvent(rawBody, signature, this.env.STRIPE_WEBHOOK_SECRET);
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    const existing = await this.prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
    if (existing?.status === 'PROCESSED') return;
    if (!existing) {
      await this.prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.syncSubscription(
            event.data.object as Stripe.Subscription,
            new Date(event.created * 1000),
          );
          break;
        case 'invoice.paid':
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = this.invoiceSubscriptionId(invoice);
          if (subscriptionId) {
            const subscription =
              await this.requireConfigured().subscriptions.retrieve(subscriptionId);
            await this.syncSubscription(subscription, new Date(event.created * 1000));
          }
          break;
        }
        default:
          break;
      }
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date(), error: null },
      });
    } catch (error) {
      await this.prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message.slice(0, 1000) : 'unknown',
        },
      });
      throw error;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const billingSubjectId = session.metadata?.billingSubjectId ?? session.client_reference_id;
    if (!billingSubjectId) throw new ConflictException('Checkout Stripe sem BillingSubject');
    await this.prisma.stripeCheckoutAttempt.updateMany({
      where: { billingSubjectId, checkoutSessionId: session.id },
      data: { stripeCustomerId: typeof session.customer === 'string' ? session.customer : null },
    });
    if (session.subscription) {
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const subscription = await this.requireConfigured().subscriptions.retrieve(subscriptionId);
      await this.syncSubscription(subscription);
    }
    // Fires once per real checkout completion (this handler, not
    // syncSubscription - that also runs on every renewal/update webhook,
    // which must never re-report as a new Purchase). Never awaited into the
    // webhook's own success/failure: a slow or failing call to Meta must
    // not make Stripe retry-deliver an already-processed event.
    void this.metaCapi.trackPurchase({
      email: session.customer_details?.email ?? null,
      value: (session.amount_total ?? 0) / 100,
      currency: (session.currency ?? 'usd').toUpperCase(),
    });
  }

  private async syncSubscription(
    subscription: Stripe.Subscription,
    sourceUpdatedAt = new Date(),
  ): Promise<void> {
    const billingSubjectId = this.resolveBillingSubjectId(subscription);
    if (!billingSubjectId)
      throw new ConflictException('Subscription Stripe sem titular de cobranca');
    const subject = await this.prisma.billingSubject.findUnique({
      where: { id: billingSubjectId },
      select: { userId: true },
    });
    if (!subject?.userId)
      throw new ConflictException('BillingSubject Stripe sem usuario vinculado');
    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) throw new ConflictException('Subscription Stripe sem item de preco');
    const priceId = subscriptionItem.price.id;
    const plan = this.planForPrice(priceId);
    const input: ProviderSubscriptionInput = {
      provider: BillingProvider.STRIPE,
      providerSubscriptionId: subscription.id,
      providerCustomerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      providerOriginalTransactionId: null,
      providerStore: 'STRIPE_WEB',
      providerEnvironment: this.env.NODE_ENV,
      status: mapStripeSubscriptionStatus(subscription.status),
      plan,
      providerPriceId: priceId,
      currency: subscriptionItem.price.currency.toUpperCase(),
      market: this.marketForPrice(priceId),
      amount: subscriptionItem.price.unit_amount,
      interval: subscriptionItem.price.recurring?.interval ?? null,
      currentPeriodStart: new Date(subscriptionItem.current_period_start * 1000),
      currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      sourceUpdatedAt,
      rawVersion: Math.max(1, subscription.latest_invoice ? 2 : 1),
    };
    await this.entitlementService.upsertProviderSubscription(subject.userId, input, new Date());
  }

  private resolveBillingSubjectId(subscription: Stripe.Subscription): string | null {
    const metadataId = subscription.metadata?.billingSubjectId;
    if (metadataId) return metadataId;
    return null;
  }

  private invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const subscription = invoice.parent?.subscription_details?.subscription;
    if (typeof subscription === 'string') return subscription;
    return subscription?.id ?? null;
  }

  // Markets without their STRIPE_PRICE_* env vars configured yet (e.g. ES
  // before the product owner's real pricing lands on Render) must never
  // throw here: this is a plain lookup used by the two matching loops below,
  // where an unset price just means "never matches", not a hard failure.
  private priceEnvForMarket(market: StripeMarket, plan: StripePlan): string | undefined {
    return this.env[`STRIPE_PRICE_${market}_${stripePriceEnvSuffix(plan)}`];
  }

  private priceForMarket(market: StripeMarket, plan: StripePlan): string {
    const price = this.priceEnvForMarket(market, plan);
    if (!price) throw new ServiceUnavailableException('Stripe price nao configurado');
    return price;
  }

  private marketForPrice(priceId: string): StripeMarket {
    for (const market of ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'PH', 'IN'] as const) {
      for (const plan of ['weekly', 'monthly', 'yearly'] as const) {
        if (this.priceEnvForMarket(market, plan) === priceId) return market;
      }
    }
    throw new ConflictException('Stripe price nao reconhecido');
  }

  private planForPrice(priceId: string | undefined): PlanType {
    for (const market of ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'PH', 'IN'] as const) {
      if (priceId === this.priceEnvForMarket(market, 'weekly')) return PlanType.PREMIUM_WEEKLY;
      if (priceId === this.priceEnvForMarket(market, 'monthly')) return PlanType.PREMIUM_MONTHLY;
      if (priceId === this.priceEnvForMarket(market, 'yearly')) return PlanType.PREMIUM_YEARLY;
    }
    throw new ConflictException('Stripe price nao reconhecido');
  }
}
