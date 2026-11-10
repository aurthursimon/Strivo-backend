import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common';
import { AccountDeletionAuthGuard } from './account-deletion-auth.guard';
import { UsersController } from './users.controller';

describe('AccountDeletionAuthGuard', () => {
  const env = { JWT_ACCESS_SECRET: 'access-secret-at-least-32-characters' };

  function contextFor(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('permits an active user and attaches the current database identity', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', email: 'old@example.com' }),
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'current@example.com',
          locale: 'pt-BR',
        }),
      },
      scanAccountCleanupTask: { findUnique: jest.fn() },
    };
    const guard = new AccountDeletionAuthGuard(jwt as never, prisma as never, env as never);
    const request = { headers: { authorization: 'Bearer valid-token' } } as Record<string, unknown>;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual({
      sub: 'user-1',
      email: 'current@example.com',
      locale: 'pt-BR',
    });
    expect(prisma.scanAccountCleanupTask.findUnique).not.toHaveBeenCalled();
  });

  it('permits a lost-response retry only when the durable receipt exists', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'deleted-user-1' }) };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      scanAccountCleanupTask: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cleanup-receipt-1' }),
      },
    };
    const guard = new AccountDeletionAuthGuard(jwt as never, prisma as never, env as never);
    const request = { headers: { authorization: 'Bearer old-valid-token' } } as Record<
      string,
      unknown
    >;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual({
      sub: 'deleted-user-1',
      email: null,
      deletionReceiptVerified: true,
    });
    expect(prisma.scanAccountCleanupTask.findUnique).toHaveBeenCalledWith({
      where: { subjectHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      select: { id: true },
    });
  });

  it('rejects an absent user when no deletion receipt exists', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'unknown-user' }) };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      scanAccountCleanupTask: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const guard = new AccountDeletionAuthGuard(jwt as never, prisma as never, env as never);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer otherwise-valid-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['invalid', 'expired'])('rejects an %s access token', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('JWT rejected')) };
    const prisma = {
      user: { findFirst: jest.fn() },
      scanAccountCleanupTask: { findUnique: jest.fn() },
    };
    const guard = new AccountDeletionAuthGuard(jwt as never, prisma as never, env as never);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer rejected-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.scanAccountCleanupTask.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the receipt bypass exclusive to DELETE /users/me', () => {
    const controller = UsersController.prototype;
    const deleteGuards = Reflect.getMetadata(GUARDS_METADATA, controller.deleteMe) as unknown[];

    expect(deleteGuards).toContain(AccountDeletionAuthGuard);
    for (const handler of [controller.getMe, controller.updateMe, controller.updateBodyData]) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).not.toContain(AccountDeletionAuthGuard);
    }
  });
});
