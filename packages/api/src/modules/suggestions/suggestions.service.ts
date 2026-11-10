import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { EmailService } from '../auth';
import { ENV_TOKEN, type Env } from '../../config';
import type { CreateSuggestionDto } from './dto';

/**
 * In-app "Suggestions" - unlike SupportService.contact() (plain email
 * forward, nothing persisted), every submission is saved durably first so
 * nothing is ever lost, then best-effort emailed to SUPPORT_EMAIL as a
 * convenience notification. EmailService.send() already no-ops safely when
 * unconfigured (logs a warning, never throws), so the DB write - the real
 * source of truth - always succeeds regardless of email setup.
 */
@Injectable()
export class SuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async create(userId: string, dto: CreateSuggestionDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    await this.prisma.suggestion.create({
      data: { userId, message: dto.message },
    });

    if (!this.env.SUPPORT_EMAIL) return;
    const html =
      `<p><strong>Usuario:</strong> ${escapeHtml(user?.name ?? 'desconhecido')} ` +
      `(${escapeHtml(user?.email ?? 'sem e-mail cadastrado')}, id ${escapeHtml(userId)})</p>` +
      `<p>${escapeHtml(dto.message).replace(/\n/g, '<br>')}</p>`;

    await this.emailService.send({
      to: this.env.SUPPORT_EMAIL,
      subject: '[My Peptides] Nova sugestao',
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
