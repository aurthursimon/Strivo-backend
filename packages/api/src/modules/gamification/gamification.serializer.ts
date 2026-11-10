/**
 * Serializers puros de Gamificacao (DB row -> shape app).
 *
 * Funcoes puras, sem dependencia de Nest/Prisma. Espelha o padrao de
 * common/enum-maps.ts e meal.serializer.ts. Nao expoe campos internos
 * (userId, badgeId, createdAt).
 */
import { levelForPoints, xpToNextLevel } from './gamification.constants';

interface BadgeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl?: string | null;
}

interface UserBadgeRow {
  unlockedAt: Date | string;
  badge: BadgeRow;
}

interface PointsEventRow {
  eventId: string;
  type: string;
  points: number;
  occurredAt: Date | string;
  meta?: unknown;
}

interface ProfileRow {
  points: number;
  level: number;
}

/** Badge do catalogo -> shape app, com unlockedAt opcional do usuario. */
export function serializeBadge(badge: BadgeRow, unlockedAt?: Date | string | null) {
  return {
    id: badge.id,
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    iconUrl: badge.iconUrl ?? undefined,
    unlockedAt: unlockedAt ?? undefined,
  };
}

/** UserBadge (badge incluido) -> shape app Badge com unlockedAt do usuario. */
export function serializeUserBadge(row: UserBadgeRow) {
  return serializeBadge(row.badge, row.unlockedAt);
}

/** PointsEvent DB row -> shape app: occurredAt -> timestamp. */
export function serializePointsEvent(event: PointsEventRow) {
  return {
    eventId: event.eventId,
    type: event.type,
    points: event.points,
    timestamp: event.occurredAt,
    meta: (event.meta ?? undefined) as Record<string, unknown> | undefined,
  };
}

/** GamificationProfile -> shape app: deriva level/xpToNextLevel de points. */
export function serializeGamificationProfile(
  profile: ProfileRow,
  unlockedBadges: UserBadgeRow[],
  recentEvents: PointsEventRow[],
) {
  return {
    points: profile.points,
    level: levelForPoints(profile.points),
    xpToNextLevel: xpToNextLevel(profile.points),
    badges: unlockedBadges.map(serializeUserBadge),
    recentEvents: recentEvents.map(serializePointsEvent),
  };
}
