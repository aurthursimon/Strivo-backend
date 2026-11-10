import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const env = { RATE_LIMIT_ENABLED: true };

  it('permite requisicao dentro do limite', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 1 }]),
      rateLimitBucket: { deleteMany: jest.fn() },
    };
    const service = new RateLimitService(prisma as never, env as never);

    await expect(
      service.consume({ name: 'auth.login', limit: 2, windowSeconds: 60, subject: 'ip' }, {
        header: jest.fn().mockReturnValue('198.51.100.10'),
        ip: '10.0.0.1',
        socket: {},
      } as never),
    ).resolves.toBeUndefined();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('bloqueia requisicao acima do limite', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 3 }]),
      rateLimitBucket: { deleteMany: jest.fn() },
    };
    const service = new RateLimitService(prisma as never, env as never);

    try {
      await service.consume({ name: 'auth.login', limit: 2, windowSeconds: 60, subject: 'ip' }, {
        header: jest.fn().mockReturnValue('198.51.100.10'),
        ip: '10.0.0.1',
        socket: {},
      } as never);
      fail('expected rate limit to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  // Regression: production sits behind Cloudflare in front of Render's own
  // proxy - two hops, not the single-hop ALB this file's X-Forwarded-For
  // fallback assumes. Reading X-Forwarded-For's last entry in that topology
  // resolves to a shared internal/edge IP for every visitor, collapsing
  // unrelated real users into one rate-limit bucket - this is what actually
  // caused separate people to see "Muitas tentativas" together. Pins that
  // two different real visitors (different CF-Connecting-IP), sharing the
  // exact same last X-Forwarded-For hop, land in two different buckets.
  it('keys the rate limit bucket by CF-Connecting-IP, not the shared last X-Forwarded-For hop', async () => {
    const keysUsed: unknown[] = [];
    const prisma = {
      $queryRaw: jest.fn().mockImplementation((_strings: unknown, ...values: unknown[]) => {
        keysUsed.push(values[1]);
        return Promise.resolve([{ count: 1 }]);
      }),
      rateLimitBucket: { deleteMany: jest.fn() },
    };
    const service = new RateLimitService(prisma as never, env as never);
    const sharedInternalHop = '10.0.0.5, 10.0.0.5';

    const headerFor = (cfIp: string) =>
      jest.fn((name: string) => {
        if (name === 'cf-connecting-ip') return cfIp;
        if (name === 'x-forwarded-for') return sharedInternalHop;
        return undefined;
      });

    await service.consume({ name: 'auth.register', limit: 5, windowSeconds: 60, subject: 'ip' }, {
      header: headerFor('203.0.113.1'),
      ip: '10.0.0.1',
      socket: {},
    } as never);
    await service.consume({ name: 'auth.register', limit: 5, windowSeconds: 60, subject: 'ip' }, {
      header: headerFor('203.0.113.99'),
      ip: '10.0.0.1',
      socket: {},
    } as never);

    expect(keysUsed).toHaveLength(2);
    expect(keysUsed[0]).not.toBe(keysUsed[1]);
  });

  it('usa usuario autenticado quando subject e user', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 1 }]),
      rateLimitBucket: { deleteMany: jest.fn() },
    };
    const service = new RateLimitService(prisma as never, env as never);

    await service.consume({ name: 'scans.submit', limit: 2, windowSeconds: 60, subject: 'user' }, {
      header: jest.fn().mockReturnValue(undefined),
      ip: '10.0.0.1',
      socket: {},
      user: { sub: 'user-1' },
    } as never);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
