import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AchievementsService } from '../achievements';
import { serializeStreak } from './streaks.serializer';

@Injectable()
export class StreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly achievementsService: AchievementsService,
  ) {}

  private todayDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  private yesterdayDate(): Date {
    const d = this.todayDate();
    d.setDate(d.getDate() - 1);
    return d;
  }

  async getStreak(userId: string) {
    let streak = await this.prisma.streak.findUnique({ where: { userId } });
    if (!streak) {
      streak = await this.prisma.streak.create({
        data: {
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActiveDate: this.todayDate(),
        },
      });
    }
    return serializeStreak(streak);
  }

  async recordActivity(userId: string) {
    const today = this.todayDate();
    const yesterday = this.yesterdayDate();

    const streak = await this.prisma.streak.findUnique({ where: { userId } });

    if (!streak) {
      const created = await this.prisma.streak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: today,
        },
      });
      await this.achievementsService.onStreakUpdated(userId, created.currentStreak);
      return created;
    }

    const lastActive = new Date(streak.lastActiveDate);
    const lastActiveTime = lastActive.getTime();

    if (lastActiveTime === today.getTime()) {
      await this.achievementsService.onStreakUpdated(userId, streak.currentStreak);
      return streak;
    }

    let newStreak: number;
    if (lastActiveTime === yesterday.getTime()) {
      newStreak = streak.currentStreak + 1;
    } else {
      newStreak = 1;
    }

    const updated = await this.prisma.streak.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, streak.longestStreak),
        lastActiveDate: today,
      },
    });
    await this.achievementsService.onStreakUpdated(userId, updated.currentStreak);
    return updated;
  }

  async checkAndResetStaleStreaks() {
    const yesterday = this.yesterdayDate();

    const result = await this.prisma.streak.updateMany({
      where: {
        lastActiveDate: { lt: yesterday },
        currentStreak: { gt: 0 },
      },
      data: { currentStreak: 0 },
    });

    return result.count;
  }
}
