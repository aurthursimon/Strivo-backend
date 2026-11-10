/**
 * Serializers puros de Meal (DB row -> shape app).
 *
 * Contrato D1: o banco mantem a forma canonica (macros com sufixo G, loggedAt
 * como timestamp logico). A adaptacao para o shape do app (protein/carbs/fat,
 * portion/unit, createdAt) acontece SO na borda. Funcoes puras, sem dependencia
 * de Nest/Prisma — espelha o padrao de common/enum-maps.ts.
 *
 * NAO importar de common/ (o barrel transitivamente toca config, que faz
 * process.exit sem env). Tudo local ao modulo.
 */

/** Row "duck-typed" de MealItem. Campos internos extras sao aceitos e ignorados. */
interface MealItemRow {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  portionG: number;
  portionLabel?: string | null;
  // Campos internos aceitos mas nunca expostos no output:
  mealId?: string;
  foodItemId?: string | null;
  quantity?: number;
  createdAt?: Date | string;
}

/** Row "duck-typed" de Meal. Campos internos extras sao aceitos e ignorados. */
interface MealRow {
  id: string;
  type: string;
  idempotencyKey?: string | null;
  imageUrl?: string | null;
  imageHash?: string | null;
  confidence?: number | null;
  wasEdited?: boolean;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG?: number;
  loggedAt: Date | string;
  items: MealItemRow[];
  // Campos internos aceitos mas nunca expostos no output:
  userId?: string;
  dailyLogId?: string | null;
  updatedAt?: Date | string;
  aiRaw?: unknown;
  createdAt?: Date | string;
}

/** MealItem DB row -> shape app: *G renomeado, portionLabel -> unit. Sem campos internos. */
export function serializeMealItem(item: MealItemRow) {
  return {
    id: item.id,
    name: item.name,
    calories: item.calories,
    protein: item.proteinG,
    carbs: item.carbsG,
    fat: item.fatG,
    fiber: item.fiberG ?? 0,
    portion: item.portionG,
    unit: item.portionLabel,
  };
}

/** Meal DB row -> shape app: totais *G renomeados, createdAt = loggedAt. Sem campos internos. */
export function serializeMeal(meal: MealRow) {
  return {
    id: meal.id,
    type: meal.type,
    sourceKey: meal.idempotencyKey ?? undefined,
    items: meal.items.map(serializeMealItem),
    totalCalories: meal.totalCalories,
    totalProtein: meal.totalProteinG,
    totalCarbs: meal.totalCarbsG,
    totalFat: meal.totalFatG,
    totalFiber: meal.totalFiberG ?? 0,
    imageUrl: meal.imageUrl,
    imageHash: meal.imageHash,
    confidence: meal.confidence,
    wasEdited: meal.wasEdited,
    createdAt: meal.loggedAt,
  };
}
