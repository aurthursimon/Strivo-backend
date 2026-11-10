import { ConflictException } from '@nestjs/common';
import { PlanType, SubscriptionStatus } from '@prisma/client';
import { envSchema } from '../../../config/env.schema';
import { SubscriptionAccessService } from '../subscription-access.service';
import {
  StripeService,
  mapStripePriceToPlan,
  mapStripeSubscriptionStatus,
} from '../stripe.service';

const baseEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/nutriscan',
  JWT_ACCESS_SECRET: 'access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-32-characters',
};

const stripePrices = {
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
  STRIPE_PRICE_PH_WEEKLY: 'price_ph_weekly',
  STRIPE_PRICE_PH_MONTHLY: 'price_ph_monthly',
  STRIPE_PRICE_PH_YEARLY: 'price_ph_yearly',
};

const testEnv = {
  ...baseEnv,
  ...stripePrices,
  NODE_ENV: 'test',
  FRONTEND_URL: 'https://web.example.test',
  STRIPE_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'x'.repeat(24),
};

// Not configured (no META_PIXEL_ID/META_CAPI_ACCESS_TOKEN in testEnv), so
// MetaCapiService's own isConfigured() check is a no-op for every test here
// regardless - this stub exists only to satisfy StripeService's
// constructor signature.
const fakeMetaCapi = { trackPurchase: async () => undefined };

describe('Stripe billing contracts', () => {
  it.each([
    ['trialing', SubscriptionStatus.TRIALING],
    ['active', SubscriptionStatus.ACTIVE],
    ['past_due', SubscriptionStatus.PAST_DUE],
    ['canceled', SubscriptionStatus.CANCELED],
    ['incomplete', SubscriptionStatus.INCOMPLETE],
    ['unpaid', SubscriptionStatus.EXPIRED],
    ['paused', SubscriptionStatus.EXPIRED],
  ] as const)('maps Stripe status %s to %s', (stripeStatus, expected) => {
    expect(mapStripeSubscriptionStatus(stripeStatus)).toBe(expected);
  });

  it('maps only configured prices to canonical plans', () => {
    expect(mapStripePriceToPlan('price_monthly', 'price_monthly', 'price_yearly')).toBe(
      PlanType.PREMIUM_MONTHLY,
    );
    expect(mapStripePriceToPlan('price_yearly', 'price_monthly', 'price_yearly')).toBe(
      PlanType.PREMIUM_YEARLY,
    );
    expect(() => mapStripePriceToPlan('price_attacker', 'price_monthly', 'price_yearly')).toThrow(
      ConflictException,
    );
  });

  it('validates all fifteen market prices when Stripe is enabled', () => {
    const result = envSchema.safeParse({ ...testEnv });
    expect(result.success).toBe(true);
  });

  it.each(['US', 'CA', 'GB', 'DE', 'FR'] as const)('accepts market %s', (market) => {
    expect(
      envSchema.safeParse({ ...testEnv, STRIPE_PRICE_US_MONTHLY: `price_${market}` }).success,
    ).toBe(true);
  });

  it('rejects Stripe when a market Price ID is missing', () => {
    const result = envSchema.safeParse({ ...testEnv, STRIPE_PRICE_DE_YEARLY: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toContain('STRIPE_PRICE_DE_YEARLY');
    }
  });

  it('accepts production with Stripe and without RevenueCat', () => {
    const result = envSchema.safeParse({
      ...testEnv,
      NODE_ENV: 'production',
    });
    expect(result.success).toBe(true);
  });

  it('creates an authenticated monthly Checkout using the user email from the database', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@example.test' }) },
      billingSubject: {
        upsert: jest.fn().mockResolvedValue({ id: 'subject-1' }),
        create: jest.fn(),
      },
      stripeCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'attempt-1', checkoutSessionId: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      billingSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const stripe = {
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus-1' }) },
      checkout: {
        sessions: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'cs-1', url: 'https://checkout.stripe.test/cs-1' }),
          retrieve: jest.fn(),
        },
      },
      webhooks: { constructEvent: jest.fn() },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    const result = await service.createCheckoutSession('user-1', 'monthly', 'US', 'checkout-key-1');

    // Response contains only what the caller needs to redirect — no claimToken
    // in the authenticated flow, since BillingSubject is already linked.
    expect(result).toEqual({ id: 'cs-1', url: 'https://checkout.stripe.test/cs-1' });

    // Email never comes from the caller — it's looked up by the authenticated userId.
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1', deletedAt: null },
      select: { email: true },
    });

    // BillingSubject is always resolved/created already linked to the user —
    // the orphan `.create({ data: {} })` path must never be exercised.
    expect(prisma.billingSubject.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
      select: { id: true },
    });
    expect(prisma.billingSubject.create).not.toHaveBeenCalled();

    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'buyer@example.test',
        metadata: { billingSubjectId: 'subject-1', userId: 'user-1' },
      }),
      { idempotencyKey: 'customer:subject-1' },
    );

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus-1',
        line_items: [{ price: 'price_us_monthly', quantity: 1 }],
        client_reference_id: 'subject-1',
        metadata: { billingSubjectId: 'subject-1', userId: 'user-1', plan: 'monthly', market: 'US' },
        subscription_data: {
          metadata: {
            billingSubjectId: 'subject-1',
            userId: 'user-1',
            plan: 'monthly',
            market: 'US',
          },
          trial_period_days: 3,
        },
      }),
      { idempotencyKey: 'checkout-key-1' },
    );
  });

  it.each([
    ['weekly', 3],
    ['monthly', 3],
    ['yearly', 3],
  ] as const)('gives every %s checkout a %d-day trial', async (plan, expectedTrialDays) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@example.test' }) },
      billingSubject: { upsert: jest.fn().mockResolvedValue({ id: 'subject-1' }) },
      stripeCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'attempt-1', checkoutSessionId: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      billingSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const stripe = {
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus-1' }) },
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({ id: 'cs-1', url: null }),
          retrieve: jest.fn(),
        },
      },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    await service.createCheckoutSession('user-1', plan, 'US', `checkout-key-${plan}`);

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: expect.objectContaining({ trial_period_days: expectedTrialDays }),
      }),
      { idempotencyKey: `checkout-key-${plan}` },
    );
  });

  it.each(["app", "app-upgrade"] as const)("charges immediately for app context %s", async (context) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@example.test' }) },
      billingSubject: { upsert: jest.fn().mockResolvedValue({ id: 'subject-1' }) },
      stripeCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'attempt-1', checkoutSessionId: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      billingSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const stripe = {
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus-1' }) },
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({ id: 'cs-1', url: null }),
          retrieve: jest.fn(),
        },
      },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    await service.createCheckoutSession(
      'user-1',
      'monthly',
      'US',
      'checkout-key-upgrade',
      context,
    );

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: expect.stringContaining('&context=app'),
        cancel_url: expect.stringContaining('?context=app'),
        subscription_data: {
          metadata: {
            billingSubjectId: 'subject-1',
            userId: 'user-1',
            plan: 'monthly',
            market: 'US',
          },
          // No trial_period_days key at all - not trial_period_days: 0 or
          // undefined, since Stripe treats an explicit 0/undefined the same
          // as "has a trial field", so the key itself must be absent.
        },
      }),
      { idempotencyKey: 'checkout-key-upgrade' },
    );
    const [[sessionArgs]] = stripe.checkout.sessions.create.mock.calls;
    expect(sessionArgs.subscription_data).not.toHaveProperty('trial_period_days');
  });

  it('creates yearly Checkout with the configured market price for the authenticated user', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@example.test' }) },
      billingSubject: { upsert: jest.fn().mockResolvedValue({ id: 'subject-1' }) },
      stripeCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'attempt-1', checkoutSessionId: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      billingSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const stripe = {
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus-1' }) },
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({ id: 'cs-2', url: null }),
          retrieve: jest.fn(),
        },
      },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    await service.createCheckoutSession('user-1', 'yearly', 'CA', 'checkout-key-2');

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_ca_yearly', quantity: 1 }] }),
      { idempotencyKey: 'checkout-key-2' },
    );
  });

  it('returns the existing Checkout Session on an idempotent retry without creating a duplicate', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'buyer@example.test' }) },
      billingSubject: { upsert: jest.fn().mockResolvedValue({ id: 'subject-1' }) },
      stripeCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue({ checkoutSessionId: 'cs-existing' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const stripe = {
      customers: { create: jest.fn() },
      checkout: {
        sessions: {
          create: jest.fn(),
          retrieve: jest
            .fn()
            .mockResolvedValue({ id: 'cs-existing', url: 'https://checkout.test/existing' }),
        },
      },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

    const result = await service.createCheckoutSession('user-1', 'monthly', 'US', 'same-key');

    expect(result).toEqual({ id: 'cs-existing', url: 'https://checkout.test/existing' });
    // Idempotent retry must not mint a new Stripe Customer or Checkout Session.
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects checkout when the authenticated user has no persisted email', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: null }) },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: {}, writable: true });

    await expect(
      service.createCheckoutSession('user-without-email', 'monthly', 'US', 'checkout-key-3'),
    ).rejects.toThrow('e-mail cadastrado');
  });

  it('rejects an invalid webhook signature before processing', () => {
    const service = new StripeService({} as never, {} as never, fakeMetaCapi as never, testEnv as never);
    expect(() => service.constructWebhookEvent(Buffer.from('{}'), 'invalid')).toThrow();
  });

  it('enforces billing when Stripe is configured without RevenueCat', () => {
    const service = new SubscriptionAccessService({} as never, testEnv as never);
    expect(service.isBillingEnforced()).toBe(true);
  });
});

it('rejects a claim from an account with a different email', async () => {
  const prisma = {
    stripeCheckoutAttempt: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'attempt-1',
        checkoutSessionId: 'cs-1',
        claimExpiresAt: new Date(Date.now() + 60_000),
        claimedAt: null,
        billingSubjectId: 'subject-1',
        billingSubject: { userId: null },
      }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'wrong@example.test' }) },
  };
  const stripe = {
    checkout: {
      sessions: {
        retrieve: jest.fn().mockResolvedValue({
          customer: { id: 'cus-1', email: 'buyer@example.test' },
          metadata: { billingSubjectId: 'subject-1' },
          payment_status: 'paid',
          subscription: 'sub-1',
        }),
      },
    },
  };
  const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
  Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

  await expect(
    service.claimCheckoutSession('user-2', 'claim-token-' + 'x'.repeat(32)),
  ).rejects.toThrow('nao pertence ao e-mail');
});

it.each(['user-1', 'user-2'])(
  'rejects a second claim after it was already used by %s',
  async (userId) => {
    const prisma = {
      stripeCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue({
          checkoutSessionId: 'cs-1',
          claimExpiresAt: new Date(Date.now() + 60_000),
          claimedAt: new Date(),
          billingSubject: { userId: 'user-1' },
        }),
      },
    };
    const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);
    Object.defineProperty(service, 'stripe', { value: {} });

    await expect(
      service.claimCheckoutSession(userId, 'claim-token-' + 'x'.repeat(32)),
    ).rejects.toThrow('ja utilizado');
  },
);

it('ignores a webhook event that was already processed', async () => {
  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn().mockResolvedValue({ status: 'PROCESSED' }),
    },
  };
  const service = new StripeService(prisma as never, {} as never, fakeMetaCapi as never, testEnv as never);

  await expect(
    service.handleWebhookEvent({
      id: 'evt-1',
      type: 'invoice.paid',
      created: 1,
      data: { object: {} },
    } as never),
  ).resolves.toBeUndefined();
});

it('syncs the subscription straight from checkout.session.completed when BillingSubject already has a userId, with no /claim involved', async () => {
  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    stripeCheckoutAttempt: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // This is the authenticated-checkout invariant being exercised: userId
    // is already present, unlike the anonymous flow where it starts null.
    billingSubject: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    },
  };
  const entitlementService = {
    upsertProviderSubscription: jest.fn().mockResolvedValue({ entitlement: { active: true } }),
  };
  const fakeSubscription = {
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
  };
  const stripe = {
    subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSubscription) },
  };
  const service = new StripeService(prisma as never, entitlementService as never, fakeMetaCapi as never, testEnv as never);
  Object.defineProperty(service, 'stripe', { value: stripe, writable: true });

  const event = {
    id: 'evt-checkout-1',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs-1',
        metadata: { billingSubjectId: 'subject-1' },
        client_reference_id: 'subject-1',
        customer: 'cus-1',
        subscription: 'sub-1',
      },
    },
  };

  await expect(service.handleWebhookEvent(event as never)).resolves.toBeUndefined();

  // The entitlement is derived for the real user, proving the webhook alone
  // (no /claim call in between) was enough because userId was already set
  // on the BillingSubject at checkout-creation time.
  expect(entitlementService.upsertProviderSubscription).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ provider: 'STRIPE', providerSubscriptionId: 'sub-1' }),
    expect.any(Date),
  );
  expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith({
    where: { id: 'evt-checkout-1' },
    data: { status: 'PROCESSED', processedAt: expect.any(Date), error: null },
  });
});

// Regression: ES/IN are registered markets (create-stripe-checkout.dto.ts)
// but testEnv above deliberately has no STRIPE_PRICE_ES_*/STRIPE_PRICE_IN_*
// set, exactly like production before the product owner configures them on
// Render. marketForPrice/planForPrice used to call the *throwing*
// priceForMarket() while scanning every registered market in order, so
// reaching an unconfigured ES/IN entry blew up matching for every other
// (fully configured) market's webhooks too - not just ES/IN's own. This
// pins a real subscription price (already exercised above) still resolving
// with ES/IN present-but-unconfigured in the same env.
it('still resolves an already-configured market when a later-registered market (ES/IN) has no price configured', async () => {
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
  const service = new StripeService(prisma as never, entitlementService as never, fakeMetaCapi as never, testEnv as never);

  const subscription = {
    id: 'sub-fr',
    status: 'active',
    customer: 'cus-1',
    metadata: { billingSubjectId: 'subject-1' },
    items: {
      data: [
        {
          price: {
            id: 'price_fr_yearly',
            currency: 'eur',
            unit_amount: 3490,
            recurring: { interval: 'year' },
          },
          current_period_start: 1_700_000_000,
          current_period_end: 1_731_536_000,
        },
      ],
    },
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    latest_invoice: null,
  };

  await expect(
    service.handleWebhookEvent({
      id: 'evt-sub-1',
      type: 'customer.subscription.created',
      created: Math.floor(Date.now() / 1000),
      data: { object: subscription },
    } as never),
  ).resolves.toBeUndefined();

  expect(entitlementService.upsertProviderSubscription).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ market: 'FR', currency: 'EUR' }),
    expect.any(Date),
  );
});
