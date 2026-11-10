import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  async listWithProgress(userId: string) {
    const definitions = await this.prisma.achievementDefinition.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    const unlocked = await this.prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, unlockedAt: true },
    });
    const byAchievementId = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt] as const));

    return definitions.map((d) => ({
      id: d.id,
      slug: d.slug,
      icon: d.icon,
      sortOrder: d.sortOrder,
      unlocked: byAchievementId.has(d.id),
      unlockedAt: byAchievementId.get(d.id)?.toISOString() ?? null,
    }));
  }

  private async unlockIfMissing(userId: string, slug: string): Promise<void> {
    const def = await this.prisma.achievementDefinition.findUnique({
      where: { slug },
    });
    if (!def) return;

    await this.prisma.userAchievement.upsert({
      where: {
        userId_achievementId: { userId, achievementId: def.id },
      },
      create: { userId, achievementId: def.id },
      update: {},
    });
  }

  async onMealSaved(userId: string): Promise<void> {
    const count = await this.prisma.meal.count({ where: { userId } });
    if (count >= 1) {
      await this.unlockIfMissing(userId, 'first_meal');
    }
  }

  async onWeightLogged(userId: string): Promise<void> {
    const count = await this.prisma.dailyLog.count({
      where: { userId, weightKg: { not: null } },
    });
    if (count >= 3) {
      await this.unlockIfMissing(userId, 'weight_logs_3');
    }
  }

  async onStreakUpdated(userId: string, currentStreak: number): Promise<void> {
    if (currentStreak >= 7) {
      await this.unlockIfMissing(userId, 'streak_7');
    }
  }
}
