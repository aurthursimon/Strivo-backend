import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common';
import { CreateStripeCheckoutDto } from '../dto/create-stripe-checkout.dto';
import { StripeController } from '../stripe.controller';

describe('StripeController checkout (authenticated flow)', () => {
  it('requires the same JwtAuthGuard used by the rest of the API on the checkout route', () => {
    const guards = Reflect.getMetadata('__guards__', StripeController.prototype.createCheckout) as
      | unknown[]
      | undefined;
    expect(guards).toContain(JwtAuthGuard);
  });

  it('passes the authenticated user id from @CurrentUser() — never a client-supplied id — to the service', async () => {
    const stripeService = {
      createCheckoutSession: jest
        .fn()
        .mockResolvedValue({ id: 'cs-1', url: 'https://checkout.stripe.test/cs-1' }),
    };
    const controller = new StripeController(stripeService as never);

    const result = await controller.createCheckout(
      { sub: 'user-1', email: 'user1@example.test', locale: 'en' },
      { plan: 'monthly', market: 'US' } as CreateStripeCheckoutDto,
      undefined,
    );

    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      'monthly',
      'US',
      undefined,
      undefined,
    );
    expect(result).toEqual({ id: 'cs-1', url: 'https://checkout.stripe.test/cs-1' });
  });

  it('prefers the Idempotency-Key header over a body-supplied key, same as before', async () => {
    const stripeService = {
      createCheckoutSession: jest.fn().mockResolvedValue({ id: 'cs-1', url: null }),
    };
    const controller = new StripeController(stripeService as never);

    await controller.createCheckout(
      { sub: 'user-1', email: 'user1@example.test', locale: 'en' },
      { plan: 'yearly', market: 'CA', idempotencyKey: 'from-body' } as CreateStripeCheckoutDto,
      'from-header',
    );

    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      'yearly',
      'CA',
      'from-header',
      undefined,
    );
  });

  it('passes returnContext through so Stripe can send app-initiated checkouts back to /app', async () => {
    const stripeService = {
      createCheckoutSession: jest.fn().mockResolvedValue({ id: 'cs-1', url: null }),
    };
    const controller = new StripeController(stripeService as never);

    await controller.createCheckout(
      { sub: 'user-1', email: 'user1@example.test', locale: 'en' },
      { plan: 'monthly', market: 'US', returnContext: 'app' } as CreateStripeCheckoutDto,
      undefined,
    );

    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      'monthly',
      'US',
      undefined,
      'app',
    );
  });
});

describe('CreateStripeCheckoutDto — cannot carry another user identity', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateStripeCheckoutDto,
    data: '',
  };

  it('accepts a plain plan/market payload', async () => {
    const result = await pipe.transform({ plan: 'monthly', market: 'US' }, metadata);
    expect(result).toEqual(expect.objectContaining({ plan: 'monthly', market: 'US' }));
  });

  it('rejects a payload trying to smuggle userId (User A targeting User B is structurally impossible)', async () => {
    await expect(
      pipe.transform({ plan: 'monthly', market: 'US', userId: 'user-B' }, metadata),
    ).rejects.toThrow();
  });

  it('rejects a payload trying to smuggle an email (identity never comes from the client)', async () => {
    await expect(
      pipe.transform(
        { plan: 'monthly', market: 'US', email: 'attacker@example.test' },
        metadata,
      ),
    ).rejects.toThrow();
  });
});
