import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV_TOKEN, type Env } from '../../config';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Transactional email via Resend's HTTP API - same posture as
 * MetaCapiService: optional config, isConfigured() checked, logs a warning
 * and never throws when unset or when the send itself fails. The password
 * reset flow stays correct either way (forgot-password always answers with
 * the same generic response regardless of whether this actually sent), but
 * nothing will land in an inbox until RESEND_API_KEY/EMAIL_FROM are set.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  isConfigured(): boolean {
    return Boolean(this.env.RESEND_API_KEY && this.env.EMAIL_FROM);
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        { to: input.to },
        'Email not sent: RESEND_API_KEY/EMAIL_FROM not configured.',
      );
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.env.EMAIL_FROM,
          to: input.to,
          subject: input.subject,
          html: input.html,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        }),
      });
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, body: (await response.text()).slice(0, 500) },
          'Email send rejected.',
        );
      }
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : 'unknown' },
        'Email send failed.',
      );
    }
  }
}
