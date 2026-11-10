import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV_TOKEN } from '../../config';
import type { Env } from '../../config';
import { PrismaService } from '../../prisma';
import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string | null;
  locale?: string;
  deletionReceiptVerified?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'TOKEN_MISSING',
        message: 'Token de acesso ausente. Faça login novamente.',
      });
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });

      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        select: { id: true, email: true, locale: true },
      });

      if (!user) {
        throw new Error('User not active');
      }

      (request as Request & { user: JwtPayload }).user = {
        sub: user.id,
        email: user.email,
        locale: user.locale,
      };
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'Token inválido ou expirado. Faça login novamente.',
      });
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const parts = request.headers.authorization?.split(' ') ?? [];
    if (parts.length !== 2) {
      return undefined;
    }
    const [type, token] = parts;
    return type === 'Bearer' && token ? token : undefined;
  }
}
