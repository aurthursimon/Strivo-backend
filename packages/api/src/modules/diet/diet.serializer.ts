import { localizeMealPlan, localizeRecipe } from './diet.localization';

/**
 * Serializers puros de Dieta (DB row -> shape app). Sem dependencia de Nest/Prisma.
 * Macros *G voltam sem sufixo; campos Json voltam como arrays/objetos do app.
 */

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

interface RecipeRow {
  id: string;
  name: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTimeMin: number;
  ingredientsJson: unknown;
  stepsJson: unknown;
  dietTypesJson: unknown;
  imageUrl?: string | null;
  aiGenerated: boolean;
}

export function serializeRecipe(recipe: RecipeRow, locale?: string) {
  const serialized = {
    id: recipe.id,
    name: recipe.name,
    mealType: recipe.mealType,
    calories: recipe.calories,
    protein: recipe.proteinG,
    carbs: recipe.carbsG,
    fat: recipe.fatG,
    prepTimeMin: recipe.prepTimeMin,
    ingredients: asArray<{ name: string; amount: string }>(recipe.ingredientsJson),
    steps: asArray<string>(recipe.stepsJson),
    imageUrl: recipe.imageUrl ?? undefined,
    dietTypes: asArray<string>(recipe.dietTypesJson),
    aiGenerated: recipe.aiGenerated,
  };
  return locale ? localizeRecipe(serialized, locale) : serialized;
}

interface MealPlanRow {
  id: string;
  version: number;
  rulesVersion: string;
  generatedAt: Date | string;
  dietProfileSnapshotJson: unknown;
  daysJson: unknown;
}

export function serializeMealPlan(plan: MealPlanRow, locale?: string) {
  const serialized = {
    id: plan.id,
    version: plan.version,
    rulesVersion: plan.rulesVersion,
    days: asArray(plan.daysJson),
    generatedAt: plan.generatedAt,
    dietProfileSnapshot: plan.dietProfileSnapshotJson,
  };
  return locale ? localizeMealPlan(serialized, locale) : serialized;
}

interface DietProfileRow {
  goalType: string;
  dietType?: string | null;
  restrictionsJson: unknown;
  dislikedFoodsJson: unknown;
  mealsPerDay: number;
  targetCalories: number;
}

export function serializeDietProfile(profile: DietProfileRow) {
  return {
    goalType: profile.goalType,
    dietType: profile.dietType ?? undefined,
    restrictions: asArray<string>(profile.restrictionsJson),
    dislikedFoods: asArray<string>(profile.dislikedFoodsJson),
    mealsPerDay: profile.mealsPerDay,
    targetCalories: profile.targetCalories,
  };
}
