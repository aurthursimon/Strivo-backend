import { ForbiddenException, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { calendarDayInTimeZone } from '../../common/date/calendar-day';
import { SubscriptionAccessService } from '../billing/subscription-access.service';
import { appendSyncChange, applyMealCreatedEffects, deleteSyncDraft } from '../sync';
import { mealSyncDraft } from '../sync/handlers/meal-create.handler';
import type { SaveMealDto } from './dto/save-meal.dto';
import { serializeMeal } from './meal.serializer';

const clampInt = (value: number | undefined, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), min), max);
};

const MAX_MEAL_TOTALS = {
  calories: 10_000,
  proteinG: 1_000,
  carbsG: 2_000,
  fatG: 1_000,
  fiberG: 500,
} as const;

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  private async dailyLogDate(userId: string): Promise<Date> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return calendarDayInTimeZone(new Date(), user?.timezone);
  }

  async save(userId: string, dto: SaveMealDto, idempotencyKey?: string) {
    const normalizedIdempotencyKey = idempotencyKey?.trim() || undefined;
    if (normalizedIdempotencyKey && normalizedIdempotencyKey.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Header Idempotency-Key limitado a 128 caracteres.',
      });
    }

    if (normalizedIdempotencyKey) {
      const existing = await this.prisma.meal.findFirst({
        where: { userId, idempotencyKey: normalizedIdempotencyKey },
        include: { items: true },
      });
      if (existing) return serializeMeal(existing);
    }

    // dto vem no shape do app (protein/carbs/fat/portion/unit); mapeamos para *G na borda.
    const totalCalories = dto.items.reduce((s, i) => s + i.calories * (i.quantity ?? 1), 0);
    const totalProteinG = dto.items.reduce((s, i) => s + i.protein * (i.quantity ?? 1), 0);
    const totalCarbsG = dto.items.reduce((s, i) => s + i.carbs * (i.quantity ?? 1), 0);
    const totalFatG = dto.items.reduce((s, i) => s + i.fat * (i.quantity ?? 1), 0);
    const totalFiberG = dto.items.reduce((s, i) => s + (i.fiber ?? 0) * (i.quantity ?? 1), 0);

    if (
      totalCalories > MAX_MEAL_TOTALS.calories ||
      totalProteinG > MAX_MEAL_TOTALS.proteinG ||
      totalCarbsG > MAX_MEAL_TOTALS.carbsG ||
      totalFatG > MAX_MEAL_TOTALS.fatG ||
      totalFiberG > MAX_MEAL_TOTALS.fiberG
    ) {
      throw new BadRequestException({
        code: 'MEAL_TOTALS_OUT_OF_RANGE',
        message: 'Totais da refeicao fora do intervalo permitido.',
      });
    }

    const subscribed = await this.subscriptionAccess.isSubscribed(userId);
    const dailyLogDate = await this.dailyLogDate(userId);
    let meal;
    try {
      meal = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
        if (!subscribed && !(await this.subscriptionAccess.consumeFreeMealLog(userId, tx))) {
          throw new ForbiddenException({
            code: 'FREE_MEAL_LOG_LIMIT_REACHED',
            message: 'Limite gratuito de registros de refeicao atingido.',
          });
        }
        const dailyLog = await tx.dailyLog.upsert({
          where: { userId_date: { userId, date: dailyLogDate } },
          update: {},
          create: { userId, date: dailyLogDate },
        });
        const created = await tx.meal.create({
          data: {
            userId,
            idempotencyKey: normalizedIdempotencyKey,
            type: dto.type as never,
            imageUrl: dto.imageUrl,
            imageHash: dto.imageHash,
            aiRaw: dto.aiRaw ? (dto.aiRaw as object) : undefined,
            totalCalories,
            totalProteinG,
            totalCarbsG,
            totalFatG,
            totalFiberG,
            confidence: dto.confidence,
            wasEdited: dto.wasEdited ?? false,
            dailyLogId: dailyLog.id,
            items: {
              create: dto.items.map((item) => ({
                // item.id e client-side e e intencionalmente ignorado aqui.
                name: item.name,
                portionG: item.portion,
                portionLabel: item.unit,
                calories: item.calories,
                proteinG: item.protein,
                carbsG: item.carbs,
                fatG: item.fat,
                fiberG: item.fiber ?? 0,
                quantity: item.quantity ?? 1,
                foodItemId: item.foodItemId,
              })),
            },
          },
          include: {
            items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            dailyLog: { select: { date: true } },
          },
        });

        await tx.dailyLog.update({
          where: { id: dailyLog.id },
          data: {
            totalCalories: { increment: totalCalories },
            totalProteinG: { increment: totalProteinG },
            totalCarbsG: { increment: totalCarbsG },
            totalFatG: { increment: totalFatG },
            totalFiberG: { increment: totalFiberG },
          },
        });
        await applyMealCreatedEffects(tx, userId);
        await appendSyncChange(tx, userId, mealSyncDraft(created), {
          occurredAt: created.loggedAt,
        });
        return created;
      });
    } catch (error) {
      if (normalizedIdempotencyKey && this.isIdempotencyConflict(error)) {
        const existing = await this.prisma.meal.findFirst({
          where: { userId, idempotencyKey: normalizedIdempotencyKey },
          include: { items: true },
        });
        if (existing) return serializeMeal(existing);
      }
      throw error;
    }

    return serializeMeal(meal);
  }

  private isIdempotencyConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const target = error.meta?.target;
    const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '');
    return targetText.includes('idempotencyKey');
  }

  async findByUser(userId: string, limit = 20, offset = 0, from?: Date, to?: Date) {
    // Clamp interno de limit/offset; o app espera Meal[] puro (spec 2.4), nao envelope.
    const safeLimit = clampInt(limit, 20, 1, 50);
    const safeOffset = clampInt(offset, 0, 0, 10_000);
    const boundedByDate = Boolean(from && to);
    const meals = await this.prisma.meal.findMany({
      where: {
        userId,
        ...(boundedByDate ? { loggedAt: { gte: from, lt: to } } : {}),
      },
      include: { items: true },
      orderBy: { loggedAt: 'desc' },
      // A bounded date query returns the complete interval. Legacy list calls
      // retain offset pagination and the historical 50-row safety cap.
      ...(boundedByDate ? {} : { take: safeLimit, skip: safeOffset }),
    });

    return meals.map(serializeMeal);
  }

  async findById(userId: string, mealId: string) {
    const meal = await this.prisma.meal.findFirst({
      where: { id: mealId, userId },
      include: { items: true },
    });
    if (!meal) {
      throw new NotFoundException('Refeicao nao encontrada');
    }
    return serializeMeal(meal);
  }

  async delete(userId: string, mealId: string) {
    const meal = await this.prisma.meal.findFirst({
      where: { id: mealId, userId },
    });

    if (!meal) {
      throw new NotFoundException('Refeicao nao encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      if (meal.dailyLogId) {
        await tx.dailyLog.update({
          where: { id: meal.dailyLogId },
          data: {
            totalCalories: { decrement: meal.totalCalories },
            totalProteinG: { decrement: meal.totalProteinG },
            totalCarbsG: { decrement: meal.totalCarbsG },
            totalFatG: { decrement: meal.totalFatG },
            totalFiberG: { decrement: meal.totalFiberG },
          },
        });
      }

      await tx.meal.delete({ where: { id: mealId } });
      await appendSyncChange(tx, userId, deleteSyncDraft('MEAL', mealId));
    });
  }
}
