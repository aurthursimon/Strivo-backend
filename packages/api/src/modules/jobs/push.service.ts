import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { appendSyncChange } from '../sync';
import { notificationPreferencesSyncDraft } from '../sync/handlers/notification-preferences-set.handler';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    this.enabled = !!(publicKey && privateKey && subject);

    if (this.enabled) {
      webpush.setVapidDetails(`mailto:${subject}`, publicKey!, privateKey!);
    }
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<boolean> {
    if (!this.enabled) return false;

    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { pushEnabled: true, pushSubscription: true },
    });

    if (!pref?.pushEnabled || !pref.pushSubscription) return false;

    try {
      const subscription = pref.pushSubscription as unknown as webpush.PushSubscription;
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return true;
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`,
          );
          const updated = await tx.notificationPreference.update({
            where: { userId },
            data: {
              pushEnabled: false,
              pushSubscription: Prisma.DbNull,
              syncOccurredAt: null,
              syncMutationId: null,
              syncInstallationId: null,
              syncSequence: null,
            },
          });
          await tx.user.update({
            where: { id: userId },
            data: { notificationsOptIn: false },
          });
          await appendSyncChange(tx, userId, notificationPreferencesSyncDraft(updated), {
            occurredAt: updated.updatedAt,
          });
        });
        this.logger.warn(`Subscription expired for user ${userId}, disabled push`);
      }
      return false;
    }
  }
}
