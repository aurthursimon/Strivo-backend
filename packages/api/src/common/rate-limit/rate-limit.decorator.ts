import { SetMetadata } from '@nestjs/common';

export type RateLimitSubject = 'ip' | 'user' | 'ip-user';

export interface RouteRateLimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
  subject?: RateLimitSubject;
}

export const RATE_LIMIT_KEY = 'nutriscan:rate-limit';

export const RateLimit = (options: RouteRateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
