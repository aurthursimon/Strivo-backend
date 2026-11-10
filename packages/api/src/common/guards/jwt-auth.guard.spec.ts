import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard account deletion safety', () => {
  it('rejects an old JWT when social reactivation created a different user id', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'deleted-google-1',
        email: 'google@example.com',
      }),
    };
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    const guard = new JwtAuthGuard(
      jwt as never,
      prisma as never,
      { JWT_ACCESS_SECRET: 'test-access-secret' } as never,
    );
    const request = { headers: { authorization: 'Bearer old-access-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'deleted-google-1', deletedAt: null },
      select: { id: true, email: true, locale: true },
    });
  });
});
