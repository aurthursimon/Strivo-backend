import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { EmailService } from '../auth';
import { ENV_TOKEN, type Env } from '../../config';
import type { ContactSupportDto } from './dto';

/**
 * In-app "Contact support" - forwards the message to SUPPORT_EMAIL via the
 * existing EmailService (Resend). Unlike password reset (which must always
 * answer the same way either way, to avoid leaking account existence), a
 * support message has no such constraint: if this isn't configured yet, the
 * honest answer is a clear error, not a false "sent" confirmation - see
 * isConfigured().
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.env.SUPPORT_EMAIL) && this.emailService.isConfigured();
  }

  async contact(userId: string, dto: ContactSupportDto): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'SUPPORT_NOT_CONFIGURED',
        message: 'O suporte por e-mail ainda nao esta configurado neste ambiente.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    const subject = dto.subject?.trim() || 'Nova mensagem de suporte';
    const html =
      `<p><strong>Usuario:</strong> ${escapeHtml(user?.name ?? 'desconhecido')} ` +
      `(${escapeHtml(user?.email ?? 'sem e-mail cadastrado')}, id ${escapeHtml(userId)})</p>` +
      `<p><strong>Assunto:</strong> ${escapeHtml(subject)}</p>` +
      `<p>${escapeHtml(dto.message).replace(/\n/g, '<br>')}</p>`;

    await this.emailService.send({
      // Already asserted non-null by isConfigured() above.
      to: this.env.SUPPORT_EMAIL as string,
      subject: `[My Peptides] ${subject}`,
      html,
      replyTo: user?.email ?? undefined,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
