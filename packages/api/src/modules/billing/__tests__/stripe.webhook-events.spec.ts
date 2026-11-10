import { StripeService } from '../stripe.service';

// Covers the webhook event types that stripe.service.spec.ts does not
// exercise: only 'checkout.session.completed' had a behavioral test before
// this file. Each of these dispatches through the same `switch` in
// handleWebhookEvent, so a typo in a case string would not be caught
// without a test per event type.

const testEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/nutriscan',
  JWT_ACCESS_SECRET: 'access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-32-characters',
  NODE_ENV: 'test',
  FRONTEND_URL: 'https://web.example.test',
  STRIPE_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'x'.repeat(24),
  STRIPE_PRICE_US_WEEKLY: 'price_us_weekly',
  STRIPE_PRICE_US_MONTHLY: 'price_us_monthly',
  STRIPE_PRICE_US_YEARLY: 'price_us_yearly',
  STRIPE_PRICE_CA_WEEKLY: 'price_ca_weekly',
  STRIPE_PRICE_CA_MONTHLY: 'price_ca_monthly',
  STRIPE_PRICE_CA_YEARLY: 'price_ca_yearly',
  STRIPE_PRICE_GB_WEEKLY: 'price_gb_weekly',
  STRIPE_PRICE_GB_MONTHLY: 'price_gb_monthly',
  STRIPE_PRICE_GB_YEARLY: 'price_gb_yearly',
  STRIPE_PRICE_DE_WEEKLY: 'price_de_weekly',
  STRIPE_PRICE_DE_MONTHLY: 'price_de_monthly',
  STRIPE_PRICE_DE_YEARLY: 'price_de_yearly',
  STRIPE_PRICE_FR_WEEKLY: 'price_fr_weekly',
  STRIPE_PRICE_FR_MONTHLY: 'price_fr_monthly',
  STRIPE_PRICE_FR_YEARLY: 'price_fr_yearly',
};

// Not configured here (no META_PIXEL_ID/META_CAPI_ACCESS_TOKEN), so this
// stub only exists to satisfy StripeService's constructor signature -
// handleCheckoutCompleted calling trackPurchase() on it is a real exercised
// path in this file (checkout.session.completed tests below), but
// MetaCapiService's own isConfigured() check makes it a no-op regardless.
const fakeMetaCapi = { trackPurchase: async () => undefined };

function fakeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'active',
    customer: 'cus-1',
    metadata: { billingSubjectId: 'subject-1' },
    items: {
      data: [
        {
          price: {
            id: 'price_us_monthly',
            currency: 'usd',
            unit_amount: 1999,
            recurring: { interval: 'month' },
          },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
        },
      ],
    },
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    latest_invoice: null,
    ...overrides,
  };
}

function buildHarness(subscriptionOverrides: Record<string, unknown> = {}) {
  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    billingSubject: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    },
  };
  const entitlementService = {
    upsertProviderSubscription: jest.fn().mockResolvedValue({ entitlement: { active: true } }),
  };
  const stripe = {
    subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSubscription(subscriptionOverrides)) },
  };
  const service = new StripeService(prisma as never, entitlementService as never, fakeMetaCapi as never, testEnv as never);
  Object.defineProperty(service, 'stripe', { value: stripe, writable: true });
  return { service, prisma, entitlementService, stripe };
}

describe('Stripe webhook event dispatch', () => {
  it.each([
    ['customer.subscription.created', 'active'],
    ['customer.subscription.updated', 'past_due'],
    ['customer.subscription.deleted', 'canceled'],
  ] as const)('syncs the subscription on %s', async (eventType, status) => {
    const { service, prisma, entitlementService } = buildHarness({ status });

    const event = {
      id: `evt-${eventType}`,
      type: eventType,
      created: Math.floor(Date.now() / 1000),
      data: { object: fakeSubscription({ status }) },
    };

    await expect(service.handleWebhookEvent(event as never)).resolves.toBeUndefined();

    expect(entitlementService.upsertProviderSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ provider: 'STRIPE', providerSubscriptionId: 'sub-1' }),
      expect.any(Date),
    );
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: `evt-${eventType}` },
      data: { status: 'PROCESSED', processedAt: expect.any(Date), error: null },
    });
  });

  it('re-syncs the subscription from invoice.paid by looking it up from the invoice', async () => {
    const { service, prisma, entitlementService, stripe } = buildHarness({ status: 'active' });

    const event = {
      id: 'evt-invoice-paid',
      type: 'invoice.paid',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'in_1',
          parent: { subscription_details: { subscription: 'sub-1' } },
        },
      },
    };

    await expect(service.handleWebhookEvent(event as never)).resolves.toBeUndefined();

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub-1');
    expect(entitlementService.upsertProviderSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ provider: 'STRIPE', status: 'ACTIVE' }),
      expect.any(Date),
    );
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-invoice-paid' },
      data: { status: 'PROCESSED', processedAt: expect.any(Date), error: null },
    });
  });

  it('re-syncs the subscription from invoice.payment_failed, reflecting the past_due status', async () => {
    const { service, prisma, entitlementService, stripe } = buildHarness({ status: 'past_due' });

    const event = {
      id: 'evt-invoice-failed',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'in_2',
          parent: { subscription_details: { subscription: 'sub-1' } },
        },
      },
    };

    await expect(service.handleWebhookEvent(event as never)).resolves.toBeUndefined();

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub-1');
    expect(entitlementService.upsertProviderSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ provider: 'STRIPE', status: 'PAST_DUE' }),
      expect.any(Date),
    );
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-invoice-failed' },
      data: { status: 'PROCESSED', processedAt: expect.any(Date), error: null },
    });
  });

  it('processes an invoice event with no linked subscription as a no-op success', async () => {
    const prisma = {
      stripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const stripe = { subscriptions: { retrieve: jest.fn() } };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    const event = {
      id: 'evt-invoice-orphan',
      type: 'invoice.paid',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'in_3', parent: null } },
    };

    await expect(service.handleWebhookEvent(event as never)).resolves.toBeUndefined();

    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-invoice-orphan' },
      data: { status: 'PROCESSED', processedAt: expect.any(Date), error: null },
    });
  });

  it('marks the webhook event as FAILED and rethrows when processing errors out, so Stripe retries it', async () => {
    const prisma = {
      stripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
      billingSubject: {
        // No userId linked -> syncSubscription throws ConflictException.
        findUnique: jest.fn().mockResolvedValue({ userId: null }),
      },
    };
    const stripe = { subscriptions: { retrieve: jest.fn() } };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    const event = {
      id: 'evt-broken',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: { object: fakeSubscription() },
    };

    await expect(service.handleWebhookEvent(event as never)).rejects.toThrow();

    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-broken' },
      data: { status: 'FAILED', error: expect.any(String) },
    });
  });
});
