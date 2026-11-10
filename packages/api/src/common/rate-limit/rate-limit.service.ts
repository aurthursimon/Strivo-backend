import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma';
import { ENV_TOKEN, type Env } from '../../config';
import type { JwtPayload } from '../guards';
import type { RouteRateLimitOptions } from './rate-limit.decorator';

@Injectable()
export class RateLimitService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async consume(options: RouteRateLimitOptions, req: Request): Promise<void> {
    if (!this.env.RATE_LIMIT_ENABLED) {
      return;
    }

    const limit = this.resolveNumberOverride(options.name, 'LIMIT', options.limit);
    const windowSeconds = this.resolveNumberOverride(
      options.name,
      'WINDOW_SECONDS',
      options.windowSeconds,
    );

    if (limit <= 0 || windowSeconds <= 0) {
      return;
    }

    const now = new Date();
    const windowStart = this.getWindowStart(now, windowSeconds);
    const key = this.hashKey(this.buildSubjectKey(options, req));

    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "rate_limit_buckets" ("id", "key", "route", "windowStart", "count", "updatedAt")
      VALUES (${randomUUID()}, ${key}, ${options.name}, ${windowStart}, 1, NOW())
      ON CONFLICT ("key", "route", "windowStart") DO UPDATE
      SET "count" = "rate_limit_buckets"."count" + 1,
          "updatedAt" = NOW()
      RETURNING "count"
    `;

    const count = rows[0]?.count ?? 1;
    if (count > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000),
      );
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.cleanupOldBuckets(now).catch(() => undefined);
  }

  private resolveNumberOverride(name: string, suffix: string, fallback: number): number {
    const envName = `RATE_LIMIT_${name.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_${suffix}`;
    const value = process.env[envName];
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private buildSubjectKey(options: RouteRateLimitOptions, req: Request): string {
    const ip = this.extractClientIp(req);
    const user = (req as Request & { user?: Partial<JwtPayload> }).user;
    const userId = typeof user?.sub === 'string' ? user.sub : undefined;

    switch (options.subject ?? 'ip') {
      case 'user':
        return userId ? `user:${userId}` : `ip:${ip}`;
      case 'ip-user':
        return userId ? `user:${userId}:ip:${ip}` : `ip:${ip}`;
      case 'ip':
      default:
        return `ip:${ip}`;
    }
  }

  private extractClientIp(req: Request): string {
    // Production traffic is proxied through Cloudflare in front of Render's
    // own infrastructure - two hops, not the single ALB hop this method's
    // X-Forwarded-For fallback (below) was written for. Cloudflare sets
    // CF-Connecting-IP itself, on every request it proxies, to the real
    // client IP - it cannot be spoofed by the client, since Cloudflare
    // overwrites any client-supplied value for this header. Prefer it
    // whenever present.
    //
    // Without this, X-Forwarded-For's *last* entry resolves to an
    // internal/edge hop shared by every visitor behind Cloudflare (not the
    // visitor's own IP), collapsing every real client into the exact same
    // rate-limit bucket - confirmed as the actual cause of unrelated users
    // (in different locations, on different devices) all getting
    // "Muitas tentativas" together: one person's traffic could exhaust the
    // limit for everyone else too.
    const cfConnectingIp = req.header('cf-connecting-ip');
    if (cfConnectingIp) return cfConnectingIp;

    const forwardedFor = req.header('x-forwarded-for');
    if (forwardedFor) {
      const forwardedIps = forwardedFor
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const albClientIp = forwardedIps.at(-1);
      if (albClientIp) return albClientIp;
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  private hashKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private getWindowStart(now: Date, windowSeconds: number): Date {
    const windowMs = windowSeconds * 1000;
    return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  }

  private async cleanupOldBuckets(now: Date): Promise<void> {
    if (Math.random() > 0.005) return;
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await this.prisma.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
  }
}
