import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { levelForPoints, pointsForEventType } from './gamification.constants';
import { serializeBadge, serializeGamificationProfile } from './gamification.serializer';
import type { PointsEventDto } from './dto';

const RECENT_EVENTS_LIMIT = 20;

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante que o perfil exista (idempotente). */
  private async ensureProfile(userId: string) {
    return this.prisma.gamificationProfile.upsert({
      where: { userId },
      create: { userId, points: 0, level: 1 },
      update: {},
    });
  }

  async getProfile(userId: string) {
    const profile = await this.ensureProfile(userId);
    const [badges, recentEvents] = await Promise.all([
      this.prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { unlockedAt: 'desc' },
      }),
      this.prisma.pointsEvent.findMany({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        take: RECENT_EVENTS_LIMIT,
      }),
    ]);
    return serializeGamificationProfile(profile, badges, recentEvents);
  }

  async getBadges(userId: string) {
    const [catalog, unlocked] = await Promise.all([
      this.prisma.badge.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.userBadge.findMany({ where: { userId } }),
    ]);
    const unlockedAtByBadgeId = new Map(unlocked.map((u) => [u.badgeId, u.unlockedAt]));
    return catalog.map((badge) => serializeBadge(badge, unlockedAtByBadgeId.get(badge.id)));
  }

  /**
   * Ingestao autoritativa e idempotente de eventos.
   * O servidor recalcula os pontos pelo tipo; o campo `points` do cliente e
   * ignorado. Idempotente por (userId, eventId).
   */
  async recordEvent(userId: string, dto: PointsEventDto) {
    const existing = await this.prisma.pointsEvent.findUnique({
      where: { userId_eventId: { userId, eventId: dto.eventId } },
    });
    if (existing) {
      return this.getProfile(userId);
    }

    const awarded = pointsForEventType(dto.type);
    const occurredAt = dto.timestamp ? new Date(dto.timestamp) : new Date();

    await this.ensureProfile(userId);

    await this.prisma.$transaction(async (tx) => {
      // create unico em (userId, eventId) garante idempotencia sob concorrencia.
      await tx.pointsEvent.create({
        data: {
          userId,
          eventId: dto.eventId,
          type: dto.type as never,
          points: awarded,
          occurredAt,
          meta: (dto.meta ?? undefined) as never,
        },
      });

      const profile = await tx.gamificationProfile.update({
        where: { userId },
        data: { points: { increment: awarded } },
      });

      const level = levelForPoints(profile.points);
      if (level !== profile.level) {
        await tx.gamificationProfile.update({ where: { userId }, data: { level } });
      }
    });

    await this.unlockEligibleBadges(userId);

    return this.getProfile(userId);
  }

  /** Desbloqueia badges cujo limiar de pontos foi atingido (idempotente). */
  private async unlockEligibleBadges(userId: string) {
    const profile = await this.prisma.gamificationProfile.findUnique({ where: { userId } });
    if (!profile) return;

    const eligible = await this.prisma.badge.findMany({
      where: { pointsThreshold: { not: null, lte: profile.points } },
    });
    if (eligible.length === 0) return;

    await this.prisma.userBadge.createMany({
      data: eligible.map((badge) => ({ userId, badgeId: badge.id })),
      skipDuplicates: true,
    });
  }
}
