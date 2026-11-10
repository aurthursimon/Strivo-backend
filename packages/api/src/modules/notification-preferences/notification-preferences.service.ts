import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import type { UpdatePreferencesDto } from './dto';
import { serializePreferences, mapPreferencesInput } from './notification-preferences.serializer';
import { appendSyncChange } from '../sync';
import { notificationPreferencesSyncDraft } from '../sync/handlers/notification-preferences-set.handler';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (existing) return serializePreferences(existing);

    const pref = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const concurrent = await tx.notificationPreference.findUnique({ where: { userId } });
      if (concurrent) return concurrent;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { notificationsOptIn: true },
      });
      const created = await tx.notificationPreference.create({
        data: { userId, pushEnabled: user?.notificationsOptIn ?? false },
      });
      await appendSyncChange(tx, userId, notificationPreferencesSyncDraft(created), {
        occurredAt: created.updatedAt,
      });
      return created;
    });
    return serializePreferences(pref);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const data = {
      ...mapPreferencesInput(dto),
      syncOccurredAt: null,
      syncMutationId: null,
      syncInstallationId: null,
      syncSequence: null,
    };
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const updated = await tx.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      if (dto.pushEnabled !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { notificationsOptIn: dto.pushEnabled },
        });
      }
      await appendSyncChange(tx, userId, notificationPreferencesSyncDraft(updated), {
        occurredAt: updated.updatedAt,
      });
      return serializePreferences(updated);
    });
  }

  async registerPushSubscription(userId: string, subscription: object) {
    const json = subscription as unknown as import('@prisma/client').Prisma.InputJsonValue;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const preference = await tx.notificationPreference.upsert({
        where: { userId },
        create: { userId, pushEnabled: true, pushSubscription: json },
        update: {
          pushEnabled: true,
          pushSubscription: json,
          syncOccurredAt: null,
          syncMutationId: null,
          syncInstallationId: null,
          syncSequence: null,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { notificationsOptIn: true },
      });
      await appendSyncChange(tx, userId, notificationPreferencesSyncDraft(preference), {
        occurredAt: preference.updatedAt,
      });
      return preference;
    });
    return serializePreferences(updated);
  }
}
