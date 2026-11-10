import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ENV_TOKEN, type Env } from '../../config';
import type { JwtPayload } from '../../common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AccountDeletionAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) this.reject();

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      if (!payload.sub) this.reject();
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        select: { id: true, email: true, locale: true },
      });
      if (user) {
        (request as Request & { user: JwtPayload }).user = {
          sub: user.id,
          email: user.email,
          locale: user.locale,
        };
        return true;
      }

      const subjectHash = createHash('sha256').update(payload.sub).digest('hex');
      const receipt = await this.prisma.scanAccountCleanupTask.findUnique({
        where: { subjectHash },
        select: { id: true },
      });
      if (!receipt) this.reject();
      (request as Request & { user: JwtPayload }).user = {
        sub: payload.sub,
        email: null,
        deletionReceiptVerified: true,
      };
      return true;
    } catch {
      this.reject();
    }
  }

  private reject(): never {
    throw new UnauthorizedException({
      code: 'TOKEN_INVALID',
      message: 'Token inválido ou expirado. Faça login novamente.',
    });
  }
}
