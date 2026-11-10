import { Injectable } from '@nestjs/common';
import type { Meal, MealItem, Prisma } from '@prisma/client';
import { SubscriptionAccessService } from '../../billing/subscription-access.service';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredEnum,
  requiredNumber,
  requiredString,
} from './payload-validation';
import { getOrCreateDailyLog, lockSyncUser } from './daily-log-sync';
import { applyMealCreatedEffects } from '../business-effects';

const MEAL_TYPES = [
  'BREAKFAST',
  'MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
  'SUPPER',
] as const;
const MAX_ITEMS = 50;
const MAX_TOTALS = {
  calories: 10_000,
  protein: 1_000,
  carbs: 2_000,
  fat: 1_000,
  fiber: 500,
} as const;

interface ParsedMealItem {
  id?: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  portion: number;
  unit?: string;
  quantity: number;
  foodItemId?: string;
}

interface ParsedMeal {
  type: (typeof MEAL_TYPES)[number];
  items: ParsedMealItem[];
  imageHash?: string;
  confidence?: number;
  wasEdited: boolean;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

export type StoredMealForSync = Meal & {
  items: MealItem[];
  dailyLog?: { date: Date } | null;
};

export function mealSyncDraft(meal: StoredMealForSync, dateOverride?: Date): SyncChangeDraft {
  const date = dateOverride ?? meal.dailyLog?.date;
  return {
    entityType: 'MEAL',
    entityId: meal.id,
    action: 'UPSERT',
    data: {
      id: meal.id,
      type: meal.type,
      items: meal.items.map((item) => ({
        id: item.id,
        name: item.name,
        calories: item.calories,
        protein: item.proteinG,
        carbs: item.carbsG,
        fat: item.fatG,
        fiber: item.fiberG,
        portion: item.portionG,
        unit: item.portionLabel,
        quantity: item.quantity,
        foodItemId: item.foodItemId,
      })),
      totalCalories: meal.totalCalories,
      totalProtein: meal.totalProteinG,
      totalCarbs: meal.totalCarbsG,
      totalFat: meal.totalFatG,
      totalFiber: meal.totalFiberG,
      imageHash: meal.imageHash,
      confidence: meal.confidence,
      wasEdited: meal.wasEdited,
      loggedAt: meal.loggedAt.toISOString(),
      day: date?.toISOString().slice(0, 10) ?? null,
    },
  };
}

@Injectable()
export class MealCreateSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.MEAL_CREATE;

  constructor(private readonly subscriptionAccess: SubscriptionAccessService) {}

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    const parsed = this.parsePayload(mutation.payload);

    await lockSyncUser(tx, userId);

    const existingByMutation = await tx.meal.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: mutation.mutationId } },
      include: {
        items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        dailyLog: { select: { date: true } },
      },
    });
    if (existingByMutation) {
      if (
        !this.sameMeal(
          existingByMutation,
          parsed,
          occurredAt,
          mutation.entityId,
          mutation.mutationId,
        )
      ) {
        throw new SyncOperationConflictError(
          'SYNC_MUTATION_ID_REUSED',
          'A mutationId ja identifica uma refeicao com outro conteudo.',
        );
      }
      return mealSyncDraft(existingByMutation);
    }

    const existingById = await tx.meal.findUnique({
      where: { id: mutation.entityId },
      include: {
        items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        dailyLog: { select: { date: true } },
      },
    });
    if (existingById) {
      if (
        existingById.userId !== userId ||
        !this.sameMeal(existingById, parsed, occurredAt, mutation.entityId, mutation.mutationId)
      ) {
        throw new SyncOperationConflictError(
          'SYNC_ENTITY_ID_CONFLICT',
          'O identificador da refeicao ja esta em uso.',
        );
      }
      return mealSyncDraft(existingById);
    }

    if (
      !(await this.subscriptionAccess.isSubscribed(userId)) &&
      !(await this.subscriptionAccess.consumeFreeMealLog(userId, tx))
    ) {
      throw new SyncOperationRejectedError(
        'FREE_MEAL_LOG_LIMIT_REACHED',
        'Limite gratuito de registros de refeicao atingido.',
      );
    }

    const foodItemIds = [...new Set(parsed.items.flatMap((item) => item.foodItemId ?? []))];
    if (foodItemIds.length > 0) {
      const existingFoodItems = await tx.foodItem.count({ where: { id: { in: foodItemIds } } });
      if (existingFoodItems !== foodItemIds.length) {
        throw new SyncOperationRejectedError(
          'SYNC_MEAL_FOOD_ITEM_NOT_FOUND',
          'Um item da refeicao referencia um alimento que nao existe.',
        );
      }
    }

    const { dailyLog, date } = await getOrCreateDailyLog(
      tx,
      userId,
      occurredAt,
      context.dayOverride,
    );
    const created = await tx.meal.create({
      data: {
        id: mutation.entityId,
        userId,
        idempotencyKey: mutation.mutationId,
        type: parsed.type,
        imageHash: parsed.imageHash,
        totalCalories: parsed.totals.calories,
        totalProteinG: parsed.totals.protein,
        totalCarbsG: parsed.totals.carbs,
        totalFatG: parsed.totals.fat,
        totalFiberG: parsed.totals.fiber,
        confidence: parsed.confidence,
        wasEdited: parsed.wasEdited,
        loggedAt: occurredAt,
        dailyLogId: dailyLog.id,
        items: {
          create: parsed.items.map((item) => ({
            name: item.name,
            portionG: item.portion,
            portionLabel: item.unit,
            calories: item.calories,
            proteinG: item.protein,
            carbsG: item.carbs,
            fatG: item.fat,
            fiberG: item.fiber,
            quantity: item.quantity,
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
        totalCalories: { increment: parsed.totals.calories },
        totalProteinG: { increment: parsed.totals.protein },
        totalCarbsG: { increment: parsed.totals.carbs },
        totalFatG: { increment: parsed.totals.fat },
        totalFiberG: { increment: parsed.totals.fiber },
      },
    });
    await applyMealCreatedEffects(tx, userId);

    return mealSyncDraft(created, date);
  }

  private parsePayload(payload: Record<string, unknown>): ParsedMeal {
    assertExactPayload(payload, ['type', 'items', 'imageHash', 'confidence', 'wasEdited']);
    const type = requiredEnum(payload, 'type', MEAL_TYPES);
    const rawItems = payload.items;
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
      throw new SyncOperationRejectedError(
        'SYNC_PAYLOAD_INVALID',
        `items deve conter entre 1 e ${MAX_ITEMS} itens.`,
      );
    }
    const items = rawItems.map((value, index) => this.parseItem(value, index));
    const totals = {
      calories: items.reduce((sum, item) => sum + item.calories * item.quantity, 0),
      protein: items.reduce((sum, item) => sum + item.protein * item.quantity, 0),
      carbs: items.reduce((sum, item) => sum + item.carbs * item.quantity, 0),
      fat: items.reduce((sum, item) => sum + item.fat * item.quantity, 0),
      fiber: items.reduce((sum, item) => sum + item.fiber * item.quantity, 0),
    };
    for (const [key, max] of Object.entries(MAX_TOTALS)) {
      if (totals[key as keyof typeof totals] > max) {
        throw new SyncOperationRejectedError(
          'SYNC_MEAL_TOTALS_OUT_OF_RANGE',
          'Totais da refeicao fora do intervalo permitido.',
        );
      }
    }
    return {
      type,
      items,
      imageHash: optionalString(payload, 'imageHash', 128),
      confidence: optionalNumber(payload, 'confidence', 0, 1),
      wasEdited: optionalBoolean(payload, 'wasEdited') ?? false,
      totals,
    };
  }

  private parseItem(value: unknown, index: number): ParsedMealItem {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new SyncOperationRejectedError(
        'SYNC_PAYLOAD_INVALID',
        `items[${index}] deve ser um objeto.`,
      );
    }
    const item = value as Record<string, unknown>;
    assertExactPayload(item, [
      'id',
      'name',
      'calories',
      'protein',
      'carbs',
      'fat',
      'fiber',
      'portion',
      'unit',
      'quantity',
      'foodItemId',
    ]);
    return {
      id: optionalString(item, 'id', 128),
      name: requiredString(item, 'name', 120),
      calories: requiredNumber(item, 'calories', 0, 5000),
      protein: requiredNumber(item, 'protein', 0, 500),
      carbs: requiredNumber(item, 'carbs', 0, 800),
      fat: requiredNumber(item, 'fat', 0, 500),
      fiber: optionalNumber(item, 'fiber', 0, 200) ?? 0,
      portion: requiredNumber(item, 'portion', 1, 5000),
      unit: optionalString(item, 'unit', 80, { allowEmpty: true }),
      quantity: optionalNumber(item, 'quantity', 0.01, 20) ?? 1,
      foodItemId: optionalString(item, 'foodItemId', 128),
    };
  }

  private sameMeal(
    meal: StoredMealForSync,
    parsed: ParsedMeal,
    occurredAt: Date,
    expectedEntityId: string,
    expectedMutationId: string,
  ): boolean {
    if (
      meal.id !== expectedEntityId ||
      meal.idempotencyKey !== expectedMutationId ||
      meal.loggedAt.getTime() !== occurredAt.getTime() ||
      meal.type !== parsed.type ||
      meal.imageUrl !== null ||
      meal.aiRaw !== null ||
      meal.imageHash !== (parsed.imageHash ?? null) ||
      meal.confidence !== (parsed.confidence ?? null) ||
      meal.wasEdited !== parsed.wasEdited ||
      meal.totalCalories !== parsed.totals.calories ||
      meal.totalProteinG !== parsed.totals.protein ||
      meal.totalCarbsG !== parsed.totals.carbs ||
      meal.totalFatG !== parsed.totals.fat ||
      meal.totalFiberG !== parsed.totals.fiber ||
      meal.items.length !== parsed.items.length
    ) {
      return false;
    }
    const stored = meal.items.map((item) =>
      this.itemFingerprint({
        name: item.name,
        calories: item.calories,
        protein: item.proteinG,
        carbs: item.carbsG,
        fat: item.fatG,
        fiber: item.fiberG,
        portion: item.portionG,
        unit: item.portionLabel ?? undefined,
        quantity: item.quantity,
        foodItemId: item.foodItemId ?? undefined,
      }),
    );
    const requested = parsed.items.map((item) => this.itemFingerprint(item));
    stored.sort();
    requested.sort();
    return stored.every((value, index) => value === requested[index]);
  }

  private itemFingerprint(item: Omit<ParsedMealItem, 'id'>): string {
    return JSON.stringify([
      item.name,
      item.calories,
      item.protein,
      item.carbs,
      item.fat,
      item.fiber,
      item.portion,
      item.unit ?? null,
      item.quantity,
      item.foodItemId ?? null,
    ]);
  }
}
