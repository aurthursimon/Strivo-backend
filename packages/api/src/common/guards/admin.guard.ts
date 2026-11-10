import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type { JwtPayload } from './jwt-auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const userId = request.user?.sub;

    const user = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId, deletedAt: null },
          select: { isAdmin: true },
        })
      : null;

    if (!user?.isAdmin) {
      throw new ForbiddenException({
        code: 'ADMIN_ONLY',
        message: 'Acesso restrito a administradores.',
      });
    }

    return true;
  }
}
