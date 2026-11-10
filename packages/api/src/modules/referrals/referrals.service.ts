import { Injectable, Inject, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma';
import { ENV_TOKEN } from '../../config';
import type { Env } from '../../config';

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  private normalizeCode(raw: string | undefined | null): string | null {
    if (typeof raw !== 'string') return null;
    const c = raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    return c.length >= 6 ? c : null;
  }

  private async createUniqueCode(): Promise<string> {
    for (let i = 0; i < 12; i += 1) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      const taken = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    throw new ServiceUnavailableException({
      code: 'REFERRAL_CODE_GENERATION_FAILED',
      message:
        'Não foi possível gerar seu código de indicação. Tente criar a conta novamente em instantes.',
    });
  }

  async ensureUserReferralCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { referralCode: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }
    if (user.referralCode) return user.referralCode;
    const code = await this.createUniqueCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });
    return code;
  }

  async tryAttachInviter(newUserId: string, rawCode: string | undefined | null): Promise<void> {
    const code = this.normalizeCode(rawCode);
    if (!code) return;

    const inviter = await this.prisma.user.findFirst({
      where: { referralCode: code, deletedAt: null },
      select: { id: true },
    });
    if (!inviter || inviter.id === newUserId) return;

    const existing = await this.prisma.referral.findUnique({
      where: { inviteeId: newUserId },
    });
    if (existing) return;

    await this.prisma.referral.create({
      data: {
        inviterId: inviter.id,
        inviteeId: newUserId,
      },
    });
  }

  async getReferralDashboard(userId: string) {
    const code = await this.ensureUserReferralCode(userId);
    const base = this.env.FRONTEND_URL.replace(/\/+$/, '');
    const shareUrl = `${base}/auth/register?ref=${encodeURIComponent(code)}`;

    const [pendingCount, qualifiedCount] = await Promise.all([
      this.prisma.referral.count({
        where: { inviterId: userId, status: 'PENDING' },
      }),
      this.prisma.referral.count({
        where: { inviterId: userId, status: { in: ['QUALIFIED', 'REWARDED'] } },
      }),
    ]);

    return { code, shareUrl, pendingCount, qualifiedCount };
  }
}
