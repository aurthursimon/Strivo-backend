import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function buildContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  it('rejects when there is no authenticated user on the request', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const guard = new AdminGuard(prisma as never);

    await expect(guard.canActivate(buildContext({}))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when the authenticated user is not an admin', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ isAdmin: false }) } };
    const guard = new AdminGuard(prisma as never);
    const request = { user: { sub: 'user-1', email: 'a@b.com' } };

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', deletedAt: null },
      select: { isAdmin: true },
    });
  });

  it('rejects when the user id no longer resolves to an active user', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    const guard = new AdminGuard(prisma as never);
    const request = { user: { sub: 'deleted-user', email: 'a@b.com' } };

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows access when the authenticated user is an active admin', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ isAdmin: true }) } };
    const guard = new AdminGuard(prisma as never);
    const request = { user: { sub: 'admin-1', email: 'admin@b.com' } };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
  });
});
