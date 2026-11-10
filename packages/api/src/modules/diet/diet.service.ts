import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { serializeDietProfile, serializeMealPlan, serializeRecipe } from './diet.serializer';
import { localizeMealPlan, localizeRecipe } from './diet.localization';
import type { DietProfileDto, SwapMealDto, UpdateMealPlanDto } from './dto';

interface CatalogRecipeRow {
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

interface DietProfileInput {
  goalType: string;
  dietType?: string;
  restrictions: string[];
  dislikedFoods: string[];
  mealsPerDay: number;
  targetCalories: number;
}

interface PlannedMeal {
  mealType: string;
  targetCalories: number;
  recipe: ReturnType<typeof serializeRecipe>;
  alternatives: Array<ReturnType<typeof serializeRecipe>>;
}

interface PlannedDay {
  dayOfWeek: number;
  targetCalories: number;
  plannedCalories: number;
  calorieDelta: number;
  plannedProtein?: number;
  plannedCarbs?: number;
  plannedFat?: number;
  meals: PlannedMeal[];
}

const MEAL_TYPE_WEIGHTS: Record<string, number> = {
  BREAKFAST: 0.23,
  MORNING_SNACK: 0.1,
  LUNCH: 0.32,
  AFTERNOON_SNACK: 0.12,
  DINNER: 0.23,
  SUPPER: 0.08,
};

const MEAL_TYPE_BY_COUNT: Record<number, string[]> = {
  1: ['LUNCH'],
  2: ['BREAKFAST', 'DINNER'],
  3: ['BREAKFAST', 'LUNCH', 'DINNER'],
  4: ['BREAKFAST', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER'],
  5: ['BREAKFAST', 'MORNING_SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER'],
  6: ['BREAKFAST', 'MORNING_SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER', 'SUPPER'],
  7: [
    'BREAKFAST',
    'MORNING_SNACK',
    'LUNCH',
    'AFTERNOON_SNACK',
    'DINNER',
    'SUPPER',
    'AFTERNOON_SNACK',
  ],
  8: [
    'BREAKFAST',
    'MORNING_SNACK',
    'LUNCH',
    'AFTERNOON_SNACK',
    'DINNER',
    'SUPPER',
    'MORNING_SNACK',
    'AFTERNOON_SNACK',
  ],
};

const DIET_COMPATIBILITY: Record<string, string[]> = {
  VEGAN: ['VEGAN'],
  VEGETARIAN: ['VEGETARIAN', 'VEGAN'],
  PESCATARIAN: ['PESCATARIAN', 'VEGETARIAN', 'VEGAN'],
  KETO: ['KETO'],
  CARNIVORE: ['CARNIVORE'],
  OMNIVORE: ['OMNIVORE', 'PESCATARIAN', 'VEGETARIAN', 'VEGAN', 'KETO', 'OTHER'],
  OTHER: ['OMNIVORE', 'PESCATARIAN', 'VEGETARIAN', 'VEGAN', 'KETO', 'OTHER'],
};

const DIET_PREFERENCE_ORDER: Record<string, string[]> = {
  VEGAN: ['VEGAN'],
  VEGETARIAN: ['VEGETARIAN', 'VEGAN'],
  PESCATARIAN: ['PESCATARIAN', 'VEGETARIAN', 'VEGAN'],
  KETO: ['KETO'],
  CARNIVORE: ['CARNIVORE'],
  OMNIVORE: ['OMNIVORE', 'KETO', 'PESCATARIAN', 'VEGETARIAN', 'VEGAN', 'OTHER'],
  OTHER: ['OMNIVORE', 'PESCATARIAN', 'VEGETARIAN', 'KETO', 'VEGAN', 'OTHER'],
};

const DEFAULT_MEAL_TYPES = MEAL_TYPE_BY_COUNT[4]!;
const ALL_DIET_TYPES = DIET_COMPATIBILITY.OTHER!;

const RESTRICTION_TERMS: Record<string, string[]> = {
  lactose: [
    'queijo',
    'iogurte',
    'cottage',
    'ricota',
    'kefir',
    'whey',
    'mucarela',
    'parmesao',
    'feta',
  ],
  gluten: ['pao', 'wrap', 'macarrao', 'trigo', 'granola', 'aveia', 'cuscuz', 'crackers'],
  amendoim: ['amendoim', 'pasta de amendoim'],
  castanhas: ['castanha', 'castanhas', 'nozes', 'amendoas'],
  peixe: ['atum', 'tilapia', 'sardinha', 'salmao'],
  camarao: ['camarao'],
  ovo: ['ovo', 'ovos'],
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizedDietType(value?: string): string {
  const normalized = normalizeText(value ?? 'OTHER').toUpperCase();
  if (normalized === 'CARNIVORA') return 'CARNIVORE';
  return normalized in DIET_COMPATIBILITY ? normalized : 'OTHER';
}

@Injectable()
export class DietService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Perfil ---

  async getProfile(userId: string) {
    const profile = await this.prisma.dietProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil de dieta nao configurado.');
    return serializeDietProfile(profile);
  }

  async upsertProfile(userId: string, dto: DietProfileDto) {
    const data = {
      goalType: dto.goalType,
      dietType: dto.dietType,
      restrictionsJson: dto.restrictions as never,
      dislikedFoodsJson: dto.dislikedFoods as never,
      mealsPerDay: dto.mealsPerDay,
      targetCalories: dto.targetCalories,
    };
    const profile = await this.prisma.dietProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return serializeDietProfile(profile);
  }

  // --- Plano ativo ---

  async getActivePlan(userId: string, locale?: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { userId, active: true },
      orderBy: { generatedAt: 'desc' },
    });
    if (!plan) throw new NotFoundException('Nenhum plano alimentar ativo.');
    return serializeMealPlan(plan, locale);
  }

  async getPlanState(userId: string, locale?: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { userId, active: true },
      orderBy: { generatedAt: 'desc' },
    });
    if (!plan) throw new NotFoundException('Nenhum plano alimentar ativo.');
    return { httpStatus: 200, body: serializeMealPlan(plan, locale) };
  }

  async replacePlan(userId: string, dto: UpdateMealPlanDto) {
    const current = await this.prisma.mealPlan.findFirst({
      where: { userId, active: true },
      orderBy: { generatedAt: 'desc' },
    });
    if (!current) throw new NotFoundException('Nenhum plano alimentar ativo para atualizar.');
    const updated = await this.prisma.mealPlan.update({
      where: { id: current.id },
      data: {
        daysJson: dto.days as never,
        ...(dto.dietProfileSnapshot !== undefined
          ? { dietProfileSnapshotJson: dto.dietProfileSnapshot as never }
          : {}),
      },
    });
    return serializeMealPlan(updated);
  }

  async swapMeal(userId: string, dto: SwapMealDto, idempotencyKey?: string, locale?: string) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const requestHash = this.hash(dto);
    const replay = await this.prisma.planMutation.findUnique({
      where: {
        userId_operation_idempotencyKey: {
          userId,
          operation: 'DIET_MEAL_SWAP',
          idempotencyKey: key,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'A chave de idempotencia ja foi usada com outro payload.',
        });
      }
      return locale ? localizeMealPlan(replay.resultJson, locale) : replay.resultJson;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.mealPlan.findFirst({
          where: { id: dto.planId, userId },
        });
        if (!plan) throw new NotFoundException('Plano alimentar nao encontrado.');
        if (!plan.active || plan.version !== dto.version) {
          const current = await tx.mealPlan.findFirst({
            where: { userId, active: true },
            orderBy: { generatedAt: 'desc' },
          });
          throw new ConflictException({
            code: 'PLAN_VERSION_CONFLICT',
            message: 'O plano alimentar foi atualizado. Recarregue antes de trocar a refeicao.',
            currentPlan: current ? serializeMealPlan(current, locale) : null,
          });
        }

        const profile = plan.dietProfileSnapshotJson as unknown as DietProfileInput;
        const days = this.planDays(plan.daysJson);
        const day = days.find((item) => item.dayOfWeek === dto.dayOfWeek);
        const meal = day?.meals.find((item) => item.mealType === dto.mealType);
        if (!day || !meal) {
          throw new BadRequestException({
            code: 'MEAL_NOT_IN_PLAN',
            message: 'A refeicao informada nao existe nesse dia do plano.',
          });
        }

        const authorized = meal.alternatives.some(
          (alternative) => alternative.id === dto.alternativeRecipeId,
        );
        if (!authorized) {
          throw new BadRequestException({
            code: 'ALTERNATIVE_NOT_AUTHORIZED',
            message: 'A receita nao e uma alternativa autorizada para esta refeicao.',
          });
        }

        const recipe = await tx.recipe.findFirst({
          where: {
            id: dto.alternativeRecipeId,
            OR: [{ userId: null }, { userId }],
          },
        });
        if (!recipe || !this.recipeMatchesProfile(recipe, profile)) {
          throw new BadRequestException({
            code: 'ALTERNATIVE_INCOMPATIBLE',
            message: 'A alternativa nao atende mais as restricoes do perfil.',
          });
        }

        const catalog = (await tx.recipe.findMany({
          where: { userId: null, aiGenerated: false },
          orderBy: [{ mealType: 'asc' }, { createdAt: 'asc' }],
        })) as CatalogRecipeRow[];
        meal.recipe = serializeRecipe(recipe);
        meal.alternatives = this.pickAlternatives(
          catalog,
          profile,
          meal.mealType,
          meal.targetCalories,
          day.dayOfWeek,
          day.meals.indexOf(meal),
          recipe.id,
        );
        this.recalculateDay(day);

        const updated = await tx.mealPlan.updateMany({
          where: { id: plan.id, userId, active: true, version: dto.version },
          data: { daysJson: days as never, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'PLAN_VERSION_CONFLICT',
            message: 'O plano alimentar foi atualizado por outra operacao.',
          });
        }

        const canonical = await tx.mealPlan.findUniqueOrThrow({ where: { id: plan.id } });
        const result = serializeMealPlan(canonical);
        await tx.planMutation.create({
          data: {
            userId,
            operation: 'DIET_MEAL_SWAP',
            idempotencyKey: key,
            requestHash,
            beforeJson: serializeMealPlan(plan) as never,
            resultJson: result as never,
          },
        });
        return locale ? localizeMealPlan(result, locale) : result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentReplay = await this.prisma.planMutation.findUnique({
          where: {
            userId_operation_idempotencyKey: {
              userId,
              operation: 'DIET_MEAL_SWAP',
              idempotencyKey: key,
            },
          },
        });
        if (concurrentReplay?.requestHash === requestHash) {
          return locale
            ? localizeMealPlan(concurrentReplay.resultJson, locale)
            : concurrentReplay.resultJson;
        }
      }
      throw error;
    }
  }

  // --- Receitas ---

  async listRecipes(userId: string, locale?: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return recipes.map((recipe) => serializeRecipe(recipe, locale));
  }

  async getRecipe(userId: string, id: string, locale?: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, OR: [{ userId }, { userId: null }] },
    });
    if (!recipe) throw new NotFoundException('Receita nao encontrada.');
    return serializeRecipe(recipe, locale);
  }

  async generateReadyPlan(userId: string, dto: DietProfileDto) {
    const profile = await this.upsertProfile(userId, dto);
    return this.persistCatalogPlan(userId, {
      goalType: profile.goalType,
      dietType: profile.dietType,
      restrictions: profile.restrictions,
      dislikedFoods: profile.dislikedFoods,
      mealsPerDay: profile.mealsPerDay,
      targetCalories: profile.targetCalories,
    });
  }

  async previewReadyPlan(dto: DietProfileDto, locale?: string) {
    const profile: DietProfileInput = {
      goalType: dto.goalType,
      dietType: dto.dietType,
      restrictions: dto.restrictions,
      dislikedFoods: dto.dislikedFoods,
      mealsPerDay: dto.mealsPerDay,
      targetCalories: dto.targetCalories,
    };
    const days = await this.buildCatalogPlan(profile);
    return {
      days: days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        plannedCalories: day.plannedCalories,
        meals: day.meals.map((meal) => ({
          mealType: meal.mealType,
          name: locale ? localizeRecipe(meal.recipe, locale).name : meal.recipe.name,
          calories: meal.recipe.calories,
        })),
      })),
      mealsPerDay: profile.mealsPerDay,
    };
  }

  private async loadCatalog(): Promise<CatalogRecipeRow[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: { userId: null, aiGenerated: false },
      orderBy: [{ mealType: 'asc' }, { createdAt: 'asc' }],
    });
    return recipes as CatalogRecipeRow[];
  }

  private mealTypesForPlan(mealsPerDay: number): string[] {
    const count = Math.min(Math.max(Math.round(mealsPerDay), 1), 8);
    return MEAL_TYPE_BY_COUNT[count] ?? DEFAULT_MEAL_TYPES;
  }

  private recipeSearchText(recipe: CatalogRecipeRow): string {
    const ingredients = Array.isArray(recipe.ingredientsJson)
      ? recipe.ingredientsJson
          .map((item) =>
            item && typeof item === 'object' && 'name' in item
              ? String((item as { name?: unknown }).name ?? '')
              : String(item),
          )
          .join(' ')
      : '';
    return normalizeText(`${recipe.name} ${ingredients}`);
  }

  private blockedTerms(profile: DietProfileInput): string[] {
    const rawTerms = [...profile.restrictions, ...profile.dislikedFoods]
      .map((term) => normalizeText(term).replace(/^sem\s+/, ''))
      .filter(Boolean);

    return rawTerms.flatMap((term) => RESTRICTION_TERMS[term] ?? [term]);
  }

  private recipeMatchesProfile(recipe: CatalogRecipeRow, profile: DietProfileInput): boolean {
    const wantedDietType = normalizedDietType(profile.dietType);
    const allowedDietTypes = DIET_COMPATIBILITY[wantedDietType] ?? ALL_DIET_TYPES;
    const recipeDietTypes = asStringArray(recipe.dietTypesJson).map((type) =>
      normalizeText(type).toUpperCase(),
    );

    if (!recipeDietTypes.some((type) => allowedDietTypes.includes(type))) {
      return false;
    }

    const searchText = this.recipeSearchText(recipe);
    return !this.blockedTerms(profile).some((term) => searchText.includes(term));
  }

  private dietPreferenceScore(recipe: CatalogRecipeRow, profile: DietProfileInput): number {
    const wantedDietType = normalizedDietType(profile.dietType);
    const order = DIET_PREFERENCE_ORDER[wantedDietType] ?? DIET_PREFERENCE_ORDER.OTHER!;
    const recipeDietTypes = asStringArray(recipe.dietTypesJson).map((type) =>
      normalizeText(type).toUpperCase(),
    );
    const scores = recipeDietTypes.map((type) => {
      const index = order.indexOf(type);
      return index >= 0 ? index : order.length;
    });
    return Math.min(...scores, order.length);
  }

  private rankRecipes(
    recipes: CatalogRecipeRow[],
    targetCalories: number,
    profile: DietProfileInput,
  ): CatalogRecipeRow[] {
    return [...recipes].sort((a, b) => {
      const dietPreference =
        this.dietPreferenceScore(a, profile) - this.dietPreferenceScore(b, profile);
      if (dietPreference !== 0) return dietPreference;
      const calorieDiff =
        Math.abs(a.calories - targetCalories) - Math.abs(b.calories - targetCalories);
      if (calorieDiff !== 0) return calorieDiff;
      return a.name.localeCompare(b.name);
    });
  }

  private scopedRecipes(
    catalog: CatalogRecipeRow[],
    profile: DietProfileInput,
    mealType: string,
  ): CatalogRecipeRow[] {
    const compatible = catalog.filter((recipe) => this.recipeMatchesProfile(recipe, profile));
    const sameMealType = compatible.filter((recipe) => recipe.mealType === mealType);
    if (sameMealType.length > 0) return sameMealType;
    return compatible;
  }

  private pickRecipe(
    catalog: CatalogRecipeRow[],
    profile: DietProfileInput,
    mealType: string,
    targetCalories: number,
    dayOfWeek: number,
    slotIndex: number,
    excludeIds = new Set<string>(),
  ): CatalogRecipeRow {
    const scoped = this.scopedRecipes(catalog, profile, mealType);
    if (scoped.length === 0) {
      throw new BadRequestException(
        'Nenhuma receita fixa atende ao estilo de dieta e restricoes informadas.',
      );
    }

    const ranked = this.rankRecipes(scoped, targetCalories, profile).filter(
      (recipe) => !excludeIds.has(recipe.id),
    );
    const candidates =
      ranked.length > 0 ? ranked : this.rankRecipes(scoped, targetCalories, profile);
    const bestPreferenceScore = candidates[0]
      ? this.dietPreferenceScore(candidates[0], profile)
      : Number.POSITIVE_INFINITY;
    const preferredCandidates = candidates.filter(
      (recipe) => this.dietPreferenceScore(recipe, profile) === bestPreferenceScore,
    );
    const rotationCandidates = preferredCandidates.length > 0 ? preferredCandidates : candidates;
    const windowSize = Math.min(8, rotationCandidates.length);
    const window = rotationCandidates.slice(0, windowSize);
    const index = (dayOfWeek + slotIndex) % window.length;
    return window[index] ?? window[0]!;
  }

  private pickAlternatives(
    catalog: CatalogRecipeRow[],
    profile: DietProfileInput,
    mealType: string,
    targetCalories: number,
    dayOfWeek: number,
    slotIndex: number,
    primaryId: string,
  ) {
    const selected: CatalogRecipeRow[] = [];
    const used = new Set<string>([primaryId]);
    // Alternatives must remain in the same meal slot. Falling back to the
    // whole catalog could offer a dinner as a breakfast replacement.
    const scopes = [
      catalog.filter(
        (recipe) => recipe.mealType === mealType && this.recipeMatchesProfile(recipe, profile),
      ),
    ];

    for (const scope of scopes) {
      const ranked = this.rankRecipes(scope, targetCalories, profile);
      for (let i = 0; i < ranked.length && selected.length < 3; i += 1) {
        const recipe = ranked[(i + dayOfWeek + slotIndex) % ranked.length];
        if (recipe && !used.has(recipe.id)) {
          selected.push(recipe);
          used.add(recipe.id);
        }
      }
    }

    return selected.slice(0, 3).map((recipe) => serializeRecipe(recipe));
  }

  private async buildCatalogPlan(profile: DietProfileInput): Promise<PlannedDay[]> {
    const catalog = await this.loadCatalog();
    if (catalog.length === 0) {
      throw new BadRequestException('Catalogo fixo de dieta vazio. Rode o seed do banco.');
    }

    const mealTypes = this.mealTypesForPlan(profile.mealsPerDay);
    const totalWeight = mealTypes.reduce(
      (sum, mealType) => sum + (MEAL_TYPE_WEIGHTS[mealType] ?? 0.2),
      0,
    );

    return Array.from({ length: 7 }, (_, dayIndex) => {
      const dayOfWeek = dayIndex + 1;
      let plannedCalories = 0;
      const usedRecipeIds = new Set<string>();
      const meals = mealTypes.map((mealType, slotIndex) => {
        const targetCalories = Math.round(
          (profile.targetCalories * (MEAL_TYPE_WEIGHTS[mealType] ?? 0.2)) / totalWeight,
        );
        const recipe = this.pickRecipe(
          catalog,
          profile,
          mealType,
          targetCalories,
          dayOfWeek,
          slotIndex,
          usedRecipeIds,
        );
        usedRecipeIds.add(recipe.id);
        plannedCalories += recipe.calories;

        return {
          mealType: recipe.mealType,
          targetCalories,
          recipe: serializeRecipe(recipe),
          alternatives: this.pickAlternatives(
            catalog,
            profile,
            mealType,
            targetCalories,
            dayOfWeek,
            slotIndex,
            recipe.id,
          ),
        };
      });

      return {
        dayOfWeek,
        targetCalories: profile.targetCalories,
        plannedCalories,
        calorieDelta: plannedCalories - profile.targetCalories,
        meals,
      };
    });
  }

  private async persistCatalogPlan(userId: string, profile: DietProfileInput) {
    const days = await this.buildCatalogPlan(profile);
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.mealPlan.updateMany({
        where: { userId, active: true },
        data: { active: false },
      });
      return tx.mealPlan.create({
        data: {
          userId,
          active: true,
          daysJson: days as never,
          dietProfileSnapshotJson: profile as never,
        },
      });
    });
    return serializeMealPlan(plan);
  }

  private planDays(value: unknown): PlannedDay[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Plano alimentar armazenado em formato invalido.');
    }
    return structuredClone(value) as PlannedDay[];
  }

  private recalculateDay(day: PlannedDay): void {
    day.plannedCalories = day.meals.reduce((sum, meal) => sum + meal.recipe.calories, 0);
    day.plannedProtein = day.meals.reduce((sum, meal) => sum + meal.recipe.protein, 0);
    day.plannedCarbs = day.meals.reduce((sum, meal) => sum + meal.recipe.carbs, 0);
    day.plannedFat = day.meals.reduce((sum, meal) => sum + meal.recipe.fat, 0);
    day.calorieDelta = day.plannedCalories - day.targetCalories;
  }

  private requireIdempotencyKey(value?: string): string {
    const key = value?.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Header Idempotency-Key obrigatorio e limitado a 128 caracteres.',
      });
    }
    return key;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
