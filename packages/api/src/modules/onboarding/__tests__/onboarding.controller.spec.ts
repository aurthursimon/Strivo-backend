import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../../common';
import {
  RATE_LIMIT_KEY,
  type RouteRateLimitOptions,
} from '../../../common/rate-limit/rate-limit.decorator';
import { OnboardingController } from '../onboarding.controller';

describe('OnboardingController preview access', () => {
  it('keeps preview anonymous and rate-limited by IP', () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, OnboardingController.prototype.preview) as unknown[]) ??
      [];
    const rateLimit = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      OnboardingController.prototype.preview,
    ) as RouteRateLimitOptions;

    expect(guards).not.toContain(JwtAuthGuard);
    expect(rateLimit).toEqual({
      name: 'onboarding.preview',
      limit: 10,
      windowSeconds: 3600,
      subject: 'ip',
    });
  });

  it('keeps completion protected by JWT and rate-limited by user', () => {
    const guards =
      (Reflect.getMetadata(
        GUARDS_METADATA,
        OnboardingController.prototype.complete,
      ) as unknown[]) ?? [];
    const rateLimit = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      OnboardingController.prototype.complete,
    ) as RouteRateLimitOptions;

    expect(guards).toContain(JwtAuthGuard);
    expect(rateLimit).toEqual({
      name: 'onboarding.complete',
      limit: 5,
      windowSeconds: 3600,
      subject: 'user',
    });
  });

  it('keeps plan recovery protected and rate-limited by user', () => {
    const guards =
      (Reflect.getMetadata(
        GUARDS_METADATA,
        OnboardingController.prototype.ensurePlans,
      ) as unknown[]) ?? [];
    const rateLimit = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      OnboardingController.prototype.ensurePlans,
    ) as RouteRateLimitOptions;

    expect(guards).toContain(JwtAuthGuard);
    expect(rateLimit).toEqual({
      name: 'onboarding.plans.ensure',
      limit: 30,
      windowSeconds: 3600,
      subject: 'user',
    });
  });
});
