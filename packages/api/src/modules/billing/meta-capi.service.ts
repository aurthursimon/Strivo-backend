import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ENV_TOKEN, type Env } from '../../config';

const META_GRAPH_VERSION = 'v21.0';

interface TrackPurchaseInput {
  email: string | null;
  value: number;
  currency: string;
  eventSourceUrl?: string | null;
}

/**
 * Meta Conversions API - server-side purchase reporting, paired with the
 * browser Pixel (web-funnel's analytics.ts) per Meta's own recommendation.
 * Purchase specifically goes through CAPI rather than the browser Pixel:
 * this fires from the Stripe webhook after payment is actually confirmed,
 * so it's immune to ad blockers, iOS tracking prevention, and the
 * full-page round trip to Stripe Checkout and back that would otherwise
 * risk the browser never getting a chance to fire it at all.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger('MetaCapi');

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  isConfigured(): boolean {
    return Boolean(this.env.META_PIXEL_ID && this.env.META_CAPI_ACCESS_TOKEN);
  }

  private hashField(value: string): string {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  /**
   * Fire-and-forget by design, same posture as analytics.ts's own
   * sendJson: a failed or slow call to Meta must never affect the webhook
   * it's reporting on, so this only ever logs a warning on failure.
   */
  async trackPurchase(input: TrackPurchaseInput): Promise<void> {
    if (!this.isConfigured()) return;
    const userData: Record<string, string[]> = {};
    if (input.email) userData.em = [this.hashField(input.email)];

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_source_url: input.eventSourceUrl ?? undefined,
          user_data: userData,
          custom_data: { value: input.value, currency: input.currency },
        },
      ],
    };

    try {
      const response = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${this.env.META_PIXEL_ID}/events?access_token=${this.env.META_CAPI_ACCESS_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, body: (await response.text()).slice(0, 500) },
          'Meta CAPI Purchase event rejected.',
        );
      }
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : 'unknown' },
        'Meta CAPI Purchase event failed to send.',
      );
    }
  }
}
