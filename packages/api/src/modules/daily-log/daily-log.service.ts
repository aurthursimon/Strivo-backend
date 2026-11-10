import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { calendarDayInTimeZone } from '../../common/date/calendar-day';
import { serializeDailyLog } from './daily-log.serializer';
import { SYNC_MAX_EVENT_AGE_DAYS, SYNC_OPERATIONS, SyncService } from '../sync';

@Injectable()
export class DailyLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
  ) {}

  private async todayDate(userId: string): Promise<Date> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return calendarDayInTimeZone(new Date(), user?.timezone);
  }

  private parseDayDate(dateStr: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('Data invalida. Use YYYY-MM-DD.');
    }

    const date = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) {
      throw new BadRequestException('Data invalida. Use YYYY-MM-DD.');
    }

    return date;
  }

  private assertHistoryRange(days: number): void {
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new BadRequestException('O parametro days deve estar entre 1 e 365.');
    }
  }

  private async getOrCreateForDate(userId: string, date: Date) {
    let log = await this.prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date } },
      include: { waterEntries: { orderBy: { loggedAt: 'desc' } } },
    });

    if (!log) {
      const activeGoal = await this.prisma.goal.findFirst({
        where: { userId, isActive: true },
      });

      log = await this.prisma.dailyLog.create({
        data: {
          userId,
          date,
          targetCalories: activeGoal?.dailyCalories,
          targetProteinG: activeGoal?.dailyProteinG,
          targetCarbsG: activeGoal?.dailyCarbsG,
          targetFatG: activeGoal?.dailyFatG,
        },
        include: { waterEntries: { orderBy: { loggedAt: 'desc' } } },
      });
    }

    return log;
  }

  async getOrCreateToday(userId: string) {
    return this.getOrCreateForDate(userId, await this.todayDate(userId));
  }

  private async buildTodayResponse(userId: string) {
    const log = await this.getOrCreateToday(userId);
    return this.buildLogResponse(userId, log);
  }

  private async buildLogResponse(userId: string, log: Parameters<typeof serializeDailyLog>[0]) {
    const goal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true },
    });
    const mealsCount = await this.prisma.meal.count({
      where: { dailyLogId: log.id },
    });
    return serializeDailyLog(log, goal, mealsCount);
  }

  async getToday(userId: string) {
    return this.buildTodayResponse(userId);
  }

  async getByDate(userId: string, dateStr: string) {
    const date = this.parseDayDate(dateStr);

    const log = await this.prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date } },
    });

    if (!log) return null;
    return this.buildLogResponse(userId, log);
  }

  async logWeight(userId: string, weightKg: number) {
    await this.syncService.executeLegacyCommand(userId, {
      operation: SYNC_OPERATIONS.WEIGHT_LOG,
      payload: { weightKg },
    });
    return this.buildTodayResponse(userId);
  }

  async addWater(userId: string, amountMl: number, clientMutationId?: string, dateStr?: string) {
    const dayOverride = dateStr ? this.parseDayDate(dateStr) : undefined;
    if (dayOverride) {
      this.assertWritableDay(dayOverride, await this.todayDate(userId));
    }
    await this.syncService.executeLegacyCommand(userId, {
      operation: SYNC_OPERATIONS.WATER_ADD,
      payload: { amountMl },
      mutationId: clientMutationId,
      dayOverride,
    });

    return this.buildTodayResponse(userId);
  }

  async removeWater(userId: string, entryId: string) {
    const removed = await this.syncService.removeLegacyWater(userId, entryId);
    if (!removed) return null;

    return this.buildTodayResponse(userId);
  }

  async removeWeight(userId: string, entryId: string) {
    const removed = await this.syncService.removeLegacyWeight(userId, entryId);
    if (!removed) return null;

    return this.buildTodayResponse(userId);
  }

  /**
   * Individual weight entries, so the app can show/let the user remove a
   * specific one - getHistory()'s DailyLog.weightKg is only the day's latest
   * entry, never enough on its own to drive a remove UI.
   */
  async listWeightEntries(userId: string, days = 30) {
    this.assertHistoryRange(days);

    const endDate = await this.todayDate(userId);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);

    const entries = await this.prisma.weightEntry.findMany({
      where: { userId, measuredAt: { gte: startDate } },
      orderBy: { measuredAt: 'desc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      weightKg: entry.weightKg,
      measuredAt: entry.measuredAt.toISOString(),
    }));
  }

  /**
   * Individual entries for today, so the app can show/let the user remove a
   * specific one - getToday()'s water.{consumed,goal} is an aggregate only,
   * it was never enough to drive an edit/remove UI.
   */
  async getTodayWaterEntries(userId: string) {
    const log = await this.getOrCreateToday(userId);
    return log.waterEntries.map((entry) => ({
      id: entry.id,
      amountMl: entry.amountMl,
      loggedAt: entry.loggedAt.toISOString(),
    }));
  }

  async getHistory(userId: string, days = 7) {
    this.assertHistoryRange(days);

    const endDate = await this.todayDate(userId);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);

    const logs = await this.prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'desc' },
    });

    const goal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true },
    });
    const mealsCounts = await Promise.all(
      logs.map((log) => this.prisma.meal.count({ where: { dailyLogId: log.id } })),
    );

    return logs.map((log, index) => serializeDailyLog(log, goal, mealsCounts[index] ?? 0));
  }

  private assertWritableDay(day: Date, today: Date): void {
    const ageDays = Math.round((today.getTime() - day.getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays < 0 || ageDays > SYNC_MAX_EVENT_AGE_DAYS) {
      throw new BadRequestException(
        `A data deve estar entre hoje e os ultimos ${SYNC_MAX_EVENT_AGE_DAYS} dias.`,
      );
    }
  }
}
