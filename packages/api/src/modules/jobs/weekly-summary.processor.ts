import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AnalyticsService } from '../analytics';

@Injectable()
export class WeeklySummaryProcessor {
  private readonly logger = new Logger(WeeklySummaryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async process(): Promise<void> {
    this.logger.log('Processing weekly summary generation');

    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const lastWeekStart = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset - 7),
    );

    const usersWithLogs = await this.prisma.dailyLog.findMany({
      where: {
        date: {
          gte: lastWeekStart,
          lt: new Date(
            Date.UTC(
              lastWeekStart.getUTCFullYear(),
              lastWeekStart.getUTCMonth(),
              lastWeekStart.getUTCDate() + 7,
            ),
          ),
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    let generated = 0;

    for (const { userId } of usersWithLogs) {
      try {
        await this.analyticsService.generateWeeklySummary(userId, lastWeekStart);
        generated++;
      } catch {
        this.logger.warn(`Failed to generate summary for user ${userId}`);
      }
    }

    this.logger.log(`Generated ${generated}/${usersWithLogs.length} weekly summaries`);
  }
}
