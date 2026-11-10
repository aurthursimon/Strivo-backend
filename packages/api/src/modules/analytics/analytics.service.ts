import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import type { DailyLog } from '@prisma/client';
import { PrismaService } from '../../prisma';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private getWeekRange(offset: number): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const weekStart = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + offset * 7),
    );
    const weekEnd = new Date(
      Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6),
    );

    return { weekStart, weekEnd };
  }

  private buildDailyCalorieSeries(
    weekStart: Date,
    logs: Array<{ date: Date; totalCalories: number }>,
  ): { date: string; calories: number }[] {
    const map = new Map(
      logs.map((l) => [l.date.toISOString().slice(0, 10), l.totalCalories] as const),
    );
    const out: { date: string; calories: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(
        Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + i),
      );
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, calories: map.get(key) ?? 0 });
    }
    return out;
  }

  async getWeeklySummary(userId: string, weekOffset = 0) {
    const { weekStart, weekEnd } = this.getWeekRange(weekOffset);

    const dailyLogs = await this.prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: weekStart, lte: weekEnd },
      },
      orderBy: { date: 'asc' },
    });

    const summaryRecord = await this.generateWeeklySummary(userId, weekStart, dailyLogs);

    const prevWeekStart = new Date(
      Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() - 7),
    );
    const prevWeekEnd = new Date(
      Date.UTC(
        prevWeekStart.getUTCFullYear(),
        prevWeekStart.getUTCMonth(),
        prevWeekStart.getUTCDate() + 6,
      ),
    );

    const prevLogs = await this.prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: prevWeekStart, lte: prevWeekEnd },
      },
    });

    const prevWeekAvgCalories =
      prevLogs.length > 0
        ? prevLogs.reduce((sum, d) => sum + d.totalCalories, 0) / prevLogs.length
        : null;

    const weekOverWeekPct =
      prevWeekAvgCalories !== null && prevWeekAvgCalories > 0 && summaryRecord.daysLogged > 0
        ? Math.round(
            ((summaryRecord.avgCalories - prevWeekAvgCalories) / prevWeekAvgCalories) * 1000,
          ) / 10
        : null;

    const dailyCalories = this.buildDailyCalorieSeries(weekStart, dailyLogs);

    return {
      ...summaryRecord,
      dailyCalories,
      prevWeekAvgCalories,
      weekOverWeekPct,
    };
  }

  async getWeightTrend(userId: string, days = 30) {
    if (days < 1 || days > 365) {
      throw new HttpException('O parametro days deve estar entre 1 e 365', HttpStatus.BAD_REQUEST);
    }

    const endDate = new Date();
    const startDate = new Date(
      Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - days + 1),
    );

    const logs = await this.prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: startDate },
        weightKg: { not: null },
      },
      select: { date: true, weightKg: true },
      orderBy: { date: 'asc' },
    });

    return logs.map((log) => ({
      date: log.date.toISOString().slice(0, 10),
      weightKg: log.weightKg as number,
    }));
  }

  async generateWeeklySummary(userId: string, weekStart: Date, prefetchLogs?: DailyLog[]) {
    const weekEnd = new Date(
      Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6),
    );

    const dailyLogs =
      prefetchLogs ??
      (await this.prisma.dailyLog.findMany({
        where: {
          userId,
          date: { gte: weekStart, lte: weekEnd },
        },
        orderBy: { date: 'asc' },
      }));

    const mealUpper = new Date(weekEnd.getTime() + 86400000 - 1);

    const totalMeals = await this.prisma.meal.count({
      where: {
        userId,
        loggedAt: { gte: weekStart, lte: mealUpper },
      },
    });

    const daysLogged = dailyLogs.length;

    let avgCalories = 0;
    let avgProteinG = 0;
    let avgCarbsG = 0;
    let avgFatG = 0;
    let avgWaterMl = 0;

    if (daysLogged > 0) {
      avgCalories = dailyLogs.reduce((sum, d) => sum + d.totalCalories, 0) / daysLogged;
      avgProteinG = dailyLogs.reduce((sum, d) => sum + d.totalProteinG, 0) / daysLogged;
      avgCarbsG = dailyLogs.reduce((sum, d) => sum + d.totalCarbsG, 0) / daysLogged;
      avgFatG = dailyLogs.reduce((sum, d) => sum + d.totalFatG, 0) / daysLogged;
      avgWaterMl = dailyLogs.reduce((sum, d) => sum + d.totalWaterMl, 0) / daysLogged;
    }

    const logsWithWeight = dailyLogs.filter(
      (d): d is typeof d & { weightKg: number } => d.weightKg !== null,
    );
    const first = logsWithWeight[0];
    const last = logsWithWeight[logsWithWeight.length - 1];
    const startWeightKg = first ? first.weightKg : null;
    const endWeightKg = last ? last.weightKg : null;
    const weightChangeKg =
      startWeightKg !== null && endWeightKg !== null ? endWeightKg - startWeightKg : null;

    const activeGoal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true },
    });

    const targetCalories = activeGoal?.dailyCalories ?? null;
    const adherencePercent =
      daysLogged > 0 && targetCalories && targetCalories > 0
        ? Math.round((avgCalories / targetCalories) * 100 * 10) / 10
        : null;

    return this.prisma.weeklySummary.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      update: {
        weekEnd,
        avgCalories,
        avgProteinG,
        avgCarbsG,
        avgFatG,
        totalMeals,
        daysLogged,
        avgWaterMl,
        startWeightKg,
        endWeightKg,
        weightChangeKg,
        targetCalories,
        adherencePercent,
      },
      create: {
        userId,
        weekStart,
        weekEnd,
        avgCalories,
        avgProteinG,
        avgCarbsG,
        avgFatG,
        totalMeals,
        daysLogged,
        avgWaterMl,
        startWeightKg,
        endWeightKg,
        weightChangeKg,
        targetCalories,
        adherencePercent,
      },
    });
  }
}
