import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DietService } from '../diet.service';
import { PrismaService } from '../../../prisma';
import { createHash } from 'crypto';

const mockPrisma = {
  dietProfile: { findUnique: jest.fn(), upsert: jest.fn() },
  mealPlan: {
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  recipe: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  planMutation: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};

function catalogRecipe(id: string, calories: number, dietTypes = ['VEGAN']) {
  return {
    id,
    name: `Receita ${id}`,
    mealType: 'LUNCH',
    calories,
    proteinG: 30,
    carbsG: 50,
    fatG: 18,
    prepTimeMin: 20,
    ingredientsJson: [
      {
        name: 'Grao-de-bico',
        amount: '120 g',
        substitutions: [
          { name: 'Lentilha', amount: '120 g' },
          { name: 'Feijao', amount: '120 g' },
          { name: 'Ervilha', amount: '100 g' },
        ],
      },
    ],
    stepsJson: ['Preparar', 'Montar'],
    dietTypesJson: dietTypes,
    aiGenerated: false,
    imageUrl: null,
  };
}

describe('DietService', () => {
  let service: DietService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DietService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(DietService);
    jest.clearAllMocks();
    mockPrisma.planMutation.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    );
  });

  describe('upsertProfile', () => {
    it('mapeia arrays -> *Json e serializa de volta', async () => {
      mockPrisma.dietProfile.upsert.mockResolvedValue({
        goalType: 'LOSE',
        dietType: 'KETO',
        restrictionsJson: ['lactose'],
        dislikedFoodsJson: ['cebola'],
        mealsPerDay: 4,
        targetCalories: 1800,
      });
      const result = await service.upsertProfile('u1', {
        goalType: 'LOSE',
        dietType: 'KETO',
        restrictions: ['lactose'],
        dislikedFoods: ['cebola'],
        mealsPerDay: 4,
        targetCalories: 1800,
      } as never);

      const arg = mockPrisma.dietProfile.upsert.mock.calls[0][0];
      expect(arg.create.restrictionsJson).toEqual(['lactose']);
      expect(result).toEqual({
        goalType: 'LOSE',
        dietType: 'KETO',
        restrictions: ['lactose'],
        dislikedFoods: ['cebola'],
        mealsPerDay: 4,
        targetCalories: 1800,
      });
    });
  });

  describe('getActivePlan', () => {
    it('lanca NotFound sem plano', async () => {
      mockPrisma.mealPlan.findFirst.mockResolvedValue(null);
      await expect(service.getActivePlan('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanca NotFound quando nao existe plano ativo', async () => {
      mockPrisma.mealPlan.findFirst.mockResolvedValue(null);
      await expect(service.getPlanState('u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('generateReadyPlan', () => {
    it('processa plano com catalogo fixo sem chamar IA', async () => {
      mockPrisma.dietProfile.upsert.mockResolvedValue({
        goalType: 'MAINTAIN',
        dietType: 'VEGAN',
        restrictionsJson: [],
        dislikedFoodsJson: [],
        mealsPerDay: 1,
        targetCalories: 650,
      });
      mockPrisma.recipe.findMany.mockResolvedValue([
        catalogRecipe('r1', 610),
        catalogRecipe('r2', 640),
        catalogRecipe('r3', 680),
        catalogRecipe('r4', 700),
      ]);
      mockPrisma.mealPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mealPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-1',
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        ...data,
      }));

      const plan = (await service.generateReadyPlan('u1', {
        goalType: 'MAINTAIN',
        dietType: 'VEGAN',
        restrictions: [],
        dislikedFoods: [],
        mealsPerDay: 1,
        targetCalories: 650,
      } as never)) as {
        days: Array<{
          meals: Array<{ alternatives: unknown[]; recipe: { ingredients: unknown[] } }>;
        }>;
      };
      expect(plan).toEqual(expect.objectContaining({ id: 'plan-1', days: expect.any(Array) }));
      expect(plan.days).toHaveLength(7);
      const firstMeal = plan.days[0]!.meals[0]!;
      expect(firstMeal.alternatives).toHaveLength(3);
      expect(firstMeal.recipe.ingredients[0]).toMatchObject({
        substitutions: expect.arrayContaining([
          expect.objectContaining({ name: 'Lentilha' }),
          expect.objectContaining({ name: 'Feijao' }),
          expect.objectContaining({ name: 'Ervilha' }),
        ]),
      });
    });

    it('prefere receitas onivoras para perfil omnivore antes de fallback vegano', async () => {
      mockPrisma.dietProfile.upsert.mockResolvedValue({
        goalType: 'MAINTAIN',
        dietType: 'OMNIVORE',
        restrictionsJson: [],
        dislikedFoodsJson: [],
        mealsPerDay: 1,
        targetCalories: 650,
      });
      mockPrisma.recipe.findMany.mockResolvedValue([
        catalogRecipe('vegan-close', 650, ['VEGAN']),
        catalogRecipe('omnivore-main', 700, ['OMNIVORE', 'OTHER']),
      ]);
      mockPrisma.mealPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mealPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-2',
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        ...data,
      }));

      const plan = (await service.generateReadyPlan('u1', {
        goalType: 'MAINTAIN',
        dietType: 'OMNIVORE',
        restrictions: [],
        dislikedFoods: [],
        mealsPerDay: 1,
        targetCalories: 650,
      } as never)) as {
        days: Array<{ meals: Array<{ recipe: { name: string } }> }>;
      };
      expect(plan.days[0]!.meals[0]!.recipe.name).toBe('Receita omnivore-main');
    });

    it('usa somente receitas carnivoras para um perfil carnivore', async () => {
      mockPrisma.dietProfile.upsert.mockResolvedValue({
        goalType: 'MAINTAIN',
        dietType: 'CARNIVORE',
        restrictionsJson: [],
        dislikedFoodsJson: [],
        mealsPerDay: 1,
        targetCalories: 650,
      });
      mockPrisma.recipe.findMany.mockResolvedValue([
        catalogRecipe('omnivore', 650, ['OMNIVORE']),
        catalogRecipe('keto', 650, ['KETO']),
        catalogRecipe('carnivore-main', 700, ['CARNIVORE']),
        catalogRecipe('carnivore-alt', 720, ['CARNIVORE']),
      ]);
      mockPrisma.mealPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mealPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-carnivore',
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        ...data,
      }));

      const plan = (await service.generateReadyPlan('u1', {
        goalType: 'MAINTAIN',
        dietType: 'CARNIVORE',
        restrictions: [],
        dislikedFoods: [],
        mealsPerDay: 1,
        targetCalories: 650,
      } as never)) as {
        days: Array<{
          meals: Array<{
            recipe: { name: string };
            alternatives: Array<{ name: string; mealType: string }>;
          }>;
        }>;
      };

      for (const day of plan.days) {
        const meal = day.meals[0]!;
        expect(meal.recipe.name).toContain('carnivore');
        expect(meal.alternatives.every((recipe) => recipe.name.includes('carnivore'))).toBe(true);
        expect(meal.alternatives.every((recipe) => recipe.mealType === 'LUNCH')).toBe(true);
      }
    });
  });

  describe('swapMeal', () => {
    it('troca somente alternativa autorizada, incrementa versao e recalcula totais', async () => {
      const primary = catalogRecipe('r1', 610);
      const alternative = catalogRecipe('r2', 640);
      const plan = {
        id: 'plan-1',
        userId: 'u1',
        active: true,
        version: 1,
        rulesVersion: 'catalog-2026-07-24',
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        dietProfileSnapshotJson: {
          goalType: 'MAINTAIN',
          dietType: 'VEGAN',
          restrictions: [],
          dislikedFoods: [],
          mealsPerDay: 1,
          targetCalories: 650,
        },
        daysJson: [
          {
            dayOfWeek: 1,
            targetCalories: 650,
            plannedCalories: 610,
            calorieDelta: -40,
            meals: [
              {
                mealType: 'LUNCH',
                targetCalories: 650,
                recipe: {
                  id: 'r1',
                  name: 'Receita r1',
                  mealType: 'LUNCH',
                  calories: 610,
                  protein: 30,
                  carbs: 50,
                  fat: 18,
                  prepTimeMin: 20,
                  ingredients: [],
                  steps: [],
                  dietTypes: ['VEGAN'],
                  aiGenerated: false,
                },
                alternatives: [
                  {
                    id: 'r2',
                    name: 'Receita r2',
                    mealType: 'LUNCH',
                    calories: 640,
                    protein: 30,
                    carbs: 50,
                    fat: 18,
                    prepTimeMin: 20,
                    ingredients: [],
                    steps: [],
                    dietTypes: ['VEGAN'],
                    aiGenerated: false,
                  },
                ],
              },
            ],
          },
        ],
      };
      let updatedDays: unknown;
      mockPrisma.mealPlan.findFirst.mockResolvedValue(plan);
      mockPrisma.recipe.findFirst.mockResolvedValue(alternative);
      mockPrisma.recipe.findMany.mockResolvedValue([
        primary,
        alternative,
        catalogRecipe('r3', 680),
        catalogRecipe('r4', 700),
      ]);
      mockPrisma.mealPlan.updateMany.mockImplementation(({ data }) => {
        updatedDays = data.daysJson;
        return { count: 1 };
      });
      mockPrisma.mealPlan.findUniqueOrThrow.mockImplementation(() => ({
        ...plan,
        version: 2,
        daysJson: updatedDays,
      }));
      mockPrisma.planMutation.create.mockResolvedValue({ id: 'mutation-1' });

      const result = await service.swapMeal(
        'u1',
        {
          planId: 'plan-1',
          version: 1,
          dayOfWeek: 1,
          mealType: 'LUNCH',
          alternativeRecipeId: 'r2',
        } as never,
        'diet-swap-1',
      );

      expect(result).toMatchObject({
        id: 'plan-1',
        version: 2,
        days: [
          expect.objectContaining({
            plannedCalories: 640,
            plannedProtein: 30,
            meals: [expect.objectContaining({ recipe: expect.objectContaining({ id: 'r2' }) })],
          }),
        ],
      });
      expect(mockPrisma.planMutation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'DIET_MEAL_SWAP',
          beforeJson: expect.objectContaining({ version: 1 }),
          resultJson: expect.objectContaining({ version: 2 }),
        }),
      });
    });

    it('rejeita versao obsoleta com o plano canonico atual', async () => {
      mockPrisma.mealPlan.findFirst
        .mockResolvedValueOnce({
          id: 'plan-1',
          userId: 'u1',
          active: true,
          version: 2,
          rulesVersion: 'catalog-2026-07-24',
          generatedAt: new Date(),
          dietProfileSnapshotJson: {},
          daysJson: [],
        })
        .mockResolvedValueOnce({
          id: 'plan-1',
          version: 2,
          rulesVersion: 'catalog-2026-07-24',
          generatedAt: new Date(),
          dietProfileSnapshotJson: {},
          daysJson: [],
        });

      await expect(
        service.swapMeal(
          'u1',
          {
            planId: 'plan-1',
            version: 1,
            dayOfWeek: 1,
            mealType: 'LUNCH',
            alternativeRecipeId: 'r2',
          } as never,
          'diet-stale-1',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PLAN_VERSION_CONFLICT',
          currentPlan: expect.objectContaining({ version: 2 }),
        }),
      });
    });

    it('reutiliza o resultado da mesma chave sem executar uma segunda troca', async () => {
      const dto = {
        planId: 'plan-1',
        version: 1,
        dayOfWeek: 1,
        mealType: 'LUNCH',
        alternativeRecipeId: 'r2',
      };
      const resultJson = {
        id: 'plan-1',
        version: 2,
        rulesVersion: 'catalog-2026-07-24',
        days: [],
      };
      mockPrisma.planMutation.findUnique.mockResolvedValue({
        requestHash: createHash('sha256').update(JSON.stringify(dto)).digest('hex'),
        resultJson,
      });

      await expect(service.swapMeal('u1', dto as never, 'diet-replay-1')).resolves.toEqual(
        resultJson,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('nao permite trocar plano pertencente a outro usuario', async () => {
      mockPrisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.swapMeal(
          'u1',
          {
            planId: 'other-user-plan',
            version: 1,
            dayOfWeek: 1,
            mealType: 'LUNCH',
            alternativeRecipeId: 'r2',
          } as never,
          'diet-owner-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
