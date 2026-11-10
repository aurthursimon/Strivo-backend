import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorkoutService } from '../workout.service';
import { PrismaService } from '../../../prisma';
import { WORKOUT_TEMPLATE_CATALOG } from '../../../../prisma/seeds/workout-catalog';
import {
  classifyHealthConditions,
  WorkoutSafetyService,
  WORKOUT_CONSULT_REQUIRED_CONDITION_SLUGS,
  WORKOUT_HARD_BLOCK_CONDITION_SLUGS,
} from '../workout.safety';

const mockPrisma = {
  $queryRaw: jest.fn(),
  workoutProfile: { findUnique: jest.fn(), upsert: jest.fn() },
  workoutPlan: {
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  workoutTemplate: { findMany: jest.fn() },
  workoutSession: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  syncChange: { create: jest.fn() },
  planMutation: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};

function workoutTemplate(slug: string, daysPerWeek = 3) {
  return {
    slug,
    name: 'ABC fixo',
    splitType: 'ABC',
    experience: 'beginner',
    daysPerWeek,
    equipment: 'GYM',
    minutesPerSession: 45,
    focusAreasJson: ['peito', 'costas', 'pernas'],
    daysJson: [
      {
        dayOfWeek: 1,
        name: 'A - Peito',
        focusArea: 'peito e triceps',
        estimatedMinutes: 45,
        exercises: [
          {
            key: 'chestPressMachine',
            name: 'Supino maquina',
            category: 'STRENGTH',
            muscleGroups: ['peito', 'triceps'],
            sets: 3,
            reps: '10-12',
            restSec: 75,
            instructions: 'Empurre as alcas com controle.',
            setup: 'Regule o banco na linha do peito.',
            execution: 'Empurre sem travar os cotovelos.',
            breathing: 'Expire empurrando.',
            equipment: ['maquina'],
            commonMistakes: ['elevar ombros'],
            alternatives: ['supino halteres', 'flexao', 'crossover'],
            difficulty: 'beginner',
          },
        ],
      },
    ],
  };
}

describe('workout safety classifier', () => {
  it('bloqueia slugs de contraindicacao absoluta', () => {
    expect(classifyHealthConditions(['recent-heart-surgery'])).toBe('BLOCKED');
    expect(classifyHealthConditions(['recent-stroke'])).toBe('BLOCKED');
    expect(WORKOUT_HARD_BLOCK_CONDITION_SLUGS).toContain('unstable-angina');
  });
  it('exige consulta para slugs moderados', () => {
    expect(classifyHealthConditions(['hypertension'])).toBe('CONSULT_REQUIRED');
    expect(classifyHealthConditions(['pregnancy'])).toBe('CONSULT_REQUIRED');
    expect(WORKOUT_CONSULT_REQUIRED_CONDITION_SLUGS).toContain('type-2-diabetes');
  });
  it('SAFE quando sem slugs conhecidos', () => {
    expect(classifyHealthConditions([])).toBe('SAFE');
    expect(classifyHealthConditions(['nenhuma'])).toBe('SAFE');
  });
  it('exige consulta para condicao desconhecida em vez de assumir seguranca', () => {
    expect(classifyHealthConditions(['condicao-nao-catalogada'])).toBe('CONSULT_REQUIRED');
  });
});

describe('WorkoutService', () => {
  let service: WorkoutService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorkoutService,
        { provide: PrismaService, useValue: mockPrisma },
        WorkoutSafetyService,
      ],
    }).compile();
    service = module.get(WorkoutService);
    jest.clearAllMocks();
    mockPrisma.planMutation.findUnique.mockResolvedValue(null);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    );
    mockPrisma.workoutProfile.upsert.mockResolvedValue({
      experience: 'beginner',
      daysPerWeek: 3,
      healthConditionsJson: [],
      equipment: 'nenhum',
      minutesPerSession: 30,
    });
  });

  describe('getPlanState', () => {
    it('retorna ausente quando nao existe plano', async () => {
      mockPrisma.workoutPlan.findFirst.mockResolvedValue(null);

      await expect(service.getPlanState('u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('upsertProfile', () => {
    it('rejeita salvamento de perfil com condicao de bloqueio', async () => {
      await expect(
        service.upsertProfile(
          'u1',
          {
            experience: 'beginner',
            daysPerWeek: 3,
            healthConditions: ['recent-heart-surgery'],
            equipment: 'nenhum',
            minutesPerSession: 30,
          } as never,
          'pt',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'WORKOUT_BLOCKED' }),
      });
      expect(mockPrisma.workoutProfile.upsert).not.toHaveBeenCalled();
    });

    it('monta o plano nos dias exatos escolhidos e persiste toda a personalizacao', async () => {
      mockPrisma.workoutTemplate.findMany.mockResolvedValue([workoutTemplate('abc-fixo', 3)]);
      mockPrisma.workoutPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.workoutPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-customizado',
        version: 1,
        rulesVersion: 'catalog-2026-07-24',
        generatedAt: new Date('2026-08-12T12:00:00Z'),
        ...data,
      }));

      const plan = await service.generateReadyPlan(
        'u1',
        {
          experience: 'beginner',
          daysPerWeek: 3,
          daysOfWeek: [2, 4, 6],
          location: 'GYM',
          splitPreference: 'ABC',
          goal: 'HYPERTROPHY',
          healthConditions: [],
          equipment: 'gym',
          availableEquipment: ['machines', 'cable'],
          minutesPerSession: 45,
        } as never,
        'pt',
      );

      expect((plan.days as Array<{ dayOfWeek: number }>).map((day) => day.dayOfWeek)).toEqual([
        2, 4, 6,
      ]);
      expect(mockPrisma.workoutProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            daysOfWeekJson: [2, 4, 6],
            location: 'GYM',
            splitPreference: 'ABC',
            goal: 'HYPERTROPHY',
            availableEquipmentJson: ['machines', 'cable'],
          }),
        }),
      );
      expect(plan.workoutProfileSnapshot).toEqual(
        expect.objectContaining({ daysOfWeek: [2, 4, 6], templateSlug: 'abc-fixo' }),
      );
    });

    it('prioriza a divisao muscular escolhida quando ha opcoes equivalentes', async () => {
      const fullBody = workoutTemplate('full-body', 3);
      fullBody.splitType = 'FULL_BODY';
      const ppl = workoutTemplate('ppl-3d', 3);
      ppl.splitType = 'PPL_3D';
      mockPrisma.workoutTemplate.findMany.mockResolvedValue([fullBody, ppl]);
      mockPrisma.workoutPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.workoutPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-ppl',
        version: 1,
        rulesVersion: 'catalog-2026-08-12-personalized',
        generatedAt: new Date('2026-08-12T12:00:00Z'),
        ...data,
      }));

      const plan = await service.generateReadyPlan(
        'u1',
        {
          experience: 'beginner',
          daysPerWeek: 3,
          daysOfWeek: [1, 3, 5],
          location: 'GYM',
          splitPreference: 'PUSH_PULL_LEGS',
          goal: 'HYPERTROPHY',
          healthConditions: [],
          equipment: 'gym',
          availableEquipment: ['machines', 'cable'],
          minutesPerSession: 45,
        } as never,
        'en',
      );

      expect(plan.workoutProfileSnapshot).toEqual(
        expect.objectContaining({ templateSlug: 'ppl-3d', splitType: 'PPL_3D' }),
      );
    });

    it('persiste alternativas estruturadas e resolviveis pelo catalogo ativo', async () => {
      const template = workoutTemplate('abc-fixo', 3);
      const alternativeTemplate = workoutTemplate('alternativas', 3);
      alternativeTemplate.daysJson[0]!.exercises[0] = {
        ...alternativeTemplate.daysJson[0]!.exercises[0]!,
        key: 'dumbbellBenchPress',
        name: 'Supino com halteres',
        muscleGroups: ['peito', 'triceps'],
        equipment: ['halteres', 'banco'],
        alternatives: ['supino maquina'],
      };
      mockPrisma.workoutTemplate.findMany.mockResolvedValue([template, alternativeTemplate]);
      mockPrisma.workoutPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.workoutPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-alternatives',
        version: 1,
        rulesVersion: 'catalog-2026-08-15',
        generatedAt: new Date('2026-08-15T12:00:00Z'),
        ...data,
      }));

      const plan = await service.generateReadyPlan(
        'u1',
        {
          experience: 'beginner',
          daysPerWeek: 3,
          daysOfWeek: [1, 3, 5],
          location: 'GYM',
          splitPreference: 'ABC',
          goal: 'HYPERTROPHY',
          healthConditions: [],
          equipment: 'gym',
          availableEquipment: ['machines', 'dumbbells', 'bench'],
          minutesPerSession: 45,
        } as never,
        'pt',
      );

      expect(
        (plan.days as Array<{ exercises: Array<{ alternatives: unknown }> }>)[0]!.exercises[0]!
          .alternatives,
      ).toEqual([{ id: 'dumbbellBenchPress', name: 'supino com halteres' }]);
    });

    it('hidrata alternativas estruturadas para cada exercicio elegivel do plano gerado', async () => {
      const catalog = WORKOUT_TEMPLATE_CATALOG.map((template) => ({
        ...template,
        focusAreasJson: template.focusAreas,
        daysJson: template.days,
      }));
      mockPrisma.workoutTemplate.findMany.mockResolvedValue(catalog);
      mockPrisma.workoutPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.workoutPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-catalog',
        version: 1,
        rulesVersion: 'catalog-2026-08-15',
        generatedAt: new Date('2026-08-15T12:00:00Z'),
        ...data,
      }));

      const plan = await service.generateReadyPlan(
        'u1',
        {
          experience: 'advanced',
          daysPerWeek: 3,
          daysOfWeek: [1, 3, 5],
          location: 'GYM',
          splitPreference: 'AUTO',
          goal: 'GENERAL_FITNESS',
          healthConditions: [],
          equipment: 'gym',
          availableEquipment: [
            'bodyweight',
            'mat',
            'bands',
            'dumbbells',
            'bench',
            'barbell',
            'machines',
            'cable',
            'cardio_machine',
            'backpack',
          ],
          minutesPerSession: 45,
        } as never,
        'pt',
      );
      const catalogExercises = catalog.flatMap((template) =>
        template.daysJson.flatMap((day) => day.exercises),
      );
      const catalogIds = new Set<string>(catalogExercises.map((exercise) => exercise.key));
      const generatedExercises = (
        plan.days as Array<{
          exercises: Array<{
            sourceKey?: string;
            category: string;
            muscleGroups: string[];
            alternatives: Array<{ id: string; name: string }>;
          }>;
        }>
      ).flatMap((day) => day.exercises);
      const eligibleExercises = generatedExercises.filter((exercise) =>
        catalogExercises.some(
          (candidate) =>
            candidate.key !== exercise.sourceKey &&
            candidate.category === exercise.category &&
            candidate.muscleGroups.some((group) => exercise.muscleGroups.includes(group)),
        ),
      );

      expect(eligibleExercises.length).toBeGreaterThan(0);
      for (const exercise of eligibleExercises) {
        expect(exercise.alternatives.length).toBeGreaterThan(0);
        expect(exercise.alternatives.length).toBeLessThanOrEqual(3);
        expect(new Set(exercise.alternatives.map((alternative) => alternative.id)).size).toBe(
          exercise.alternatives.length,
        );
        expect(exercise.alternatives.every((alternative) => catalogIds.has(alternative.id))).toBe(
          true,
        );
      }
    });

    it('gera planos seguros e com alternativas resolviveis para a matriz HOME e GYM', async () => {
      const catalog = WORKOUT_TEMPLATE_CATALOG.map((template) => ({
        ...template,
        focusAreasJson: template.focusAreas,
        daysJson: template.days,
      }));
      mockPrisma.workoutTemplate.findMany.mockResolvedValue(catalog);
      mockPrisma.workoutPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.workoutPlan.create.mockImplementation(({ data }) => ({
        id: `plan-${String(data.workoutProfileSnapshotJson?.templateSlug ?? 'generated')}`,
        version: 1,
        rulesVersion: 'catalog-2026-08-15',
        generatedAt: new Date('2026-08-15T12:00:00Z'),
        ...data,
      }));

      const canonicalById = new Map<
        string,
        (typeof WORKOUT_TEMPLATE_CATALOG)[number]['days'][number]['exercises'][number]
      >();
      for (const template of catalog) {
        for (const day of template.daysJson) {
          for (const exercise of day.exercises) {
            if (!canonicalById.has(exercise.key)) canonicalById.set(exercise.key, exercise);
          }
        }
      }
      const environments = [
        { location: 'HOME', equipment: 'bodyweight', availableEquipment: ['bodyweight', 'mat'] },
        {
          location: 'HOME',
          equipment: 'bodyweight',
          availableEquipment: ['bodyweight', 'mat', 'bands'],
        },
        {
          location: 'HOME',
          equipment: 'bodyweight',
          availableEquipment: ['bodyweight', 'mat', 'dumbbells', 'bench'],
        },
        {
          location: 'GYM',
          equipment: 'gym',
          availableEquipment: [
            'bodyweight',
            'mat',
            'bands',
            'dumbbells',
            'bench',
            'barbell',
            'machines',
            'cable',
            'cardio_machine',
            'backpack',
          ],
        },
      ] as const;
      const aliases: Record<string, string[]> = {
        bodyweight: ['peso corporal'],
        mat: ['colchonete'],
        bands: ['elastico', 'faixa'],
        dumbbells: ['halter', 'halteres', 'kettlebell'],
        bench: ['banco', 'banco inclinado'],
        barbell: ['barra', 'anilha'],
        machines: ['maquina', 'maquina assistida', 'leg press', 'hack', 'smith'],
        cable: ['polia', 'cabo', 'corda', 'tornozeleira'],
        cardio_machine: [
          'esteira',
          'bicicleta',
          'eliptico',
          'remo',
          'escada',
          'simulador de escada',
        ],
        backpack: ['mochila'],
      };
      const difficulty = { beginner: 1, intermediate: 2, advanced: 3 } as const;
      const supports = (
        exercise: { equipment: string[] },
        availableEquipment: readonly string[],
      ) => {
        const capabilities = new Set([
          'peso corporal',
          'bodyweight',
          'colchonete',
          'cadeira estavel',
        ]);
        for (const selected of availableEquipment) {
          for (const alias of aliases[selected] ?? []) capabilities.add(alias);
        }
        return exercise.equipment.every((required) =>
          [...capabilities].some(
            (capability) => required.includes(capability) || capability.includes(required),
          ),
        );
      };
      const locales = ['pt', 'en', 'es'] as const;
      let generated = 0;

      for (const environment of environments) {
        for (const experience of ['beginner', 'intermediate', 'advanced'] as const) {
          for (let daysPerWeek = 1; daysPerWeek <= 6; daysPerWeek += 1) {
            const locale = locales[generated % locales.length]!;
            const plan = await service.generateReadyPlan(
              `matrix-${environment.location}-${environment.availableEquipment.join('-')}-${experience}-${daysPerWeek}`,
              {
                experience,
                daysPerWeek,
                daysOfWeek: [1, 2, 3, 4, 5, 6].slice(0, daysPerWeek),
                location: environment.location,
                splitPreference: 'AUTO',
                goal: 'GENERAL_FITNESS',
                healthConditions: [],
                equipment: environment.equipment,
                availableEquipment: [...environment.availableEquipment],
                minutesPerSession: 45,
              } as never,
              locale,
            );
            const planDays = plan.days as Array<{
              exercises: Array<{
                sourceKey?: string;
                instructions: string;
                setup?: string;
                execution?: string;
                breathing?: string;
                progression?: string;
                commonMistakes: unknown[];
                safetyNotes: unknown[];
                alternatives: Array<{ id: string; name: string }>;
              }>;
            }>;

            expect(planDays.length).toBeGreaterThan(0);
            for (const day of planDays) {
              expect(day.exercises.length).toBeGreaterThan(0);
              for (const exercise of day.exercises) {
                expect(exercise.instructions.trim()).not.toBe('');
                expect(exercise.setup?.trim()).not.toBe('');
                expect(exercise.execution?.trim()).not.toBe('');
                expect(exercise.breathing?.trim()).not.toBe('');
                expect(exercise.progression?.trim()).not.toBe('');
                expect(exercise.commonMistakes).toHaveLength(3);
                expect(exercise.safetyNotes.length).toBeGreaterThanOrEqual(1);
                if (exercise.alternatives.length === 0) {
                  throw new Error(
                    `Missing alternatives for ${exercise.sourceKey} in ${environment.location}/${environment.availableEquipment.join('+')}/${experience}/${daysPerWeek}`,
                  );
                }

                const source = canonicalById.get(exercise.sourceKey ?? '');
                expect(source).toBeDefined();
                for (const alternative of exercise.alternatives) {
                  const candidate = canonicalById.get(alternative.id);
                  expect(candidate).toBeDefined();
                  expect(candidate?.category).toBe(source?.category);
                  expect(
                    candidate?.muscleGroups.some((group) => source?.muscleGroups.includes(group)),
                  ).toBe(true);
                  expect(difficulty[candidate!.difficulty]).toBeLessThanOrEqual(
                    difficulty[experience],
                  );
                  expect(supports(candidate!, environment.availableEquipment)).toBe(true);
                }
              }
            }
            generated += 1;
          }
        }
      }
      expect(generated).toBe(72);
    }, 15_000);

    it('rejeita perfil sem equipamento antes de persistir qualquer configuracao', async () => {
      await expect(
        service.generateReadyPlan(
          'u1',
          {
            experience: 'beginner',
            daysPerWeek: 3,
            daysOfWeek: [1, 3, 5],
            location: 'HOME',
            splitPreference: 'FULL_BODY',
            goal: 'GENERAL_FITNESS',
            healthConditions: [],
            equipment: 'bodyweight',
            availableEquipment: [],
            minutesPerSession: 30,
          } as never,
          'pt',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'WORKOUT_EQUIPMENT_REQUIRED' }),
      });
      expect(mockPrisma.workoutProfile.upsert).not.toHaveBeenCalled();
    });

    it('rejeita uma divisao muscular incompatível com a quantidade de dias', async () => {
      await expect(
        service.generateReadyPlan(
          'u1',
          {
            experience: 'intermediate',
            daysPerWeek: 2,
            daysOfWeek: [1, 4],
            location: 'GYM',
            splitPreference: 'ABCDE',
            goal: 'HYPERTROPHY',
            healthConditions: [],
            equipment: 'gym',
            availableEquipment: ['machines'],
            minutesPerSession: 45,
          } as never,
          'pt',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_WORKOUT_SPLIT_DAYS' }),
      });
      expect(mockPrisma.workoutProfile.upsert).not.toHaveBeenCalled();
    });

    it('rejeita uma divisao de academia em local apenas com peso corporal', async () => {
      await expect(
        service.previewReadyPlan(
          {
            experience: 'intermediate',
            daysPerWeek: 5,
            daysOfWeek: [1, 2, 3, 5, 6],
            location: 'HOME',
            splitPreference: 'ABCDE',
            goal: 'HYPERTROPHY',
            healthConditions: [],
            equipment: 'bodyweight',
            availableEquipment: ['bodyweight'],
            minutesPerSession: 45,
          } as never,
          'pt',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_WORKOUT_SPLIT_DAYS' }),
      });
    });

    it('favorece o preset de elasticos em casa sem vazar exercicios de elástico para peso corporal ou halteres', async () => {
      mockPrisma.workoutTemplate.findMany.mockResolvedValue(
        WORKOUT_TEMPLATE_CATALOG.map((template) => ({
          ...template,
          focusAreasJson: template.focusAreas,
          daysJson: template.days,
        })),
      );
      const baseProfile = {
        experience: 'beginner',
        daysPerWeek: 3,
        daysOfWeek: [1, 3, 5],
        location: 'HOME',
        splitPreference: 'AUTO',
        goal: 'GENERAL_FITNESS',
        healthConditions: [],
        equipment: 'bodyweight',
        minutesPerSession: 40,
      };

      const pickTemplate = (profile: typeof baseProfile & { availableEquipment: string[] }) =>
        (
          service as unknown as {
            pickWorkoutTemplate: (
              currentProfile: typeof profile,
              consultMode: boolean,
            ) => Promise<(typeof WORKOUT_TEMPLATE_CATALOG)[number]>;
          }
        ).pickWorkoutTemplate(profile, false);
      const bandsTemplate = await pickTemplate({
        ...baseProfile,
        availableEquipment: ['bodyweight', 'mat', 'bands'],
      });
      expect(bandsTemplate.slug).toBe('fullbody-casa-elasticos-3d');

      const bodyweightTemplate = await pickTemplate({
        ...baseProfile,
        availableEquipment: ['bodyweight', 'mat'],
      });
      const dumbbellsTemplate = await pickTemplate({
        ...baseProfile,
        experience: 'intermediate',
        availableEquipment: ['bodyweight', 'mat', 'dumbbells', 'bench'],
      });
      const exercises = [bodyweightTemplate, dumbbellsTemplate].flatMap((template) =>
        template.days.flatMap((day) => day.exercises),
      );

      expect(
        exercises
          .flatMap((exercise) => exercise.equipment ?? [])
          .some((item) => /elástico|faixa/i.test(String(item))),
      ).toBe(false);
    });

    it('keeps every canonical exercise actionable, safe, and replaceable in at least one supported environment', () => {
      const canonicalExercises = [
        ...new Map(
          WORKOUT_TEMPLATE_CATALOG.flatMap((template) =>
            template.days.flatMap((day) =>
              day.exercises.map((exercise) => [exercise.key, exercise]),
            ),
          ),
        ).values(),
      ];
      const capabilities = [
        new Set(['peso corporal', 'bodyweight', 'colchonete', 'cadeira estavel']),
        new Set([
          'peso corporal',
          'bodyweight',
          'colchonete',
          'cadeira estavel',
          'elastico',
          'faixa',
        ]),
        new Set([
          'peso corporal',
          'bodyweight',
          'colchonete',
          'cadeira estavel',
          'halter',
          'halteres',
          'banco',
          'banco inclinado',
        ]),
        new Set([
          'peso corporal',
          'bodyweight',
          'colchonete',
          'cadeira estavel',
          'elastico',
          'faixa',
          'halter',
          'halteres',
          'kettlebell',
          'banco',
          'banco inclinado',
          'barra',
          'anilha',
          'maquina',
          'maquina assistida',
          'leg press',
          'hack',
          'smith',
          'polia',
          'cabo',
          'corda',
          'tornozeleira',
          'esteira',
          'bicicleta',
          'eliptico',
          'remo',
          'escada',
          'simulador de escada',
          'mochila',
        ]),
      ];
      const difficulty = { beginner: 1, intermediate: 2, advanced: 3 } as const;
      const supports = (exercise: { equipment: string[] }, environment: Set<string>) =>
        exercise.equipment.every((required) =>
          [...environment].some(
            (capability) => required.includes(capability) || capability.includes(required),
          ),
        );

      for (const exercise of canonicalExercises) {
        expect(exercise.instructions.trim()).not.toBe('');
        expect(exercise.setup.trim()).not.toBe('');
        expect(exercise.execution.trim()).not.toBe('');
        expect(exercise.breathing.trim()).not.toBe('');
        expect(exercise.commonMistakes).toHaveLength(3);
        expect(exercise.progression?.trim()).not.toBe('');
        expect(exercise.safetyNotes?.length).toBeGreaterThanOrEqual(1);
        expect(capabilities.some((environment) => supports(exercise, environment))).toBe(true);

        const replacement = canonicalExercises.find(
          (candidate) =>
            candidate.key !== exercise.key &&
            candidate.category === exercise.category &&
            difficulty[candidate.difficulty] <= difficulty[exercise.difficulty] &&
            candidate.muscleGroups.some((muscle) => exercise.muscleGroups.includes(muscle)) &&
            capabilities.some(
              (environment) => supports(exercise, environment) && supports(candidate, environment),
            ),
        );
        if (!replacement) {
          throw new Error(`Missing safe alternative for ${exercise.key}`);
        }
      }
    });

    it('gera plano para todas as combinacoes expostas pela tela simplificada', async () => {
      mockPrisma.workoutTemplate.findMany.mockResolvedValue(
        WORKOUT_TEMPLATE_CATALOG.map((template) => ({
          ...template,
          focusAreasJson: template.focusAreas,
          daysJson: template.days,
        })),
      );
      const environments = [
        { location: 'HOME', equipment: 'bodyweight', available: ['bodyweight', 'mat'] },
        {
          location: 'HOME',
          equipment: 'bodyweight',
          available: ['bodyweight', 'mat', 'bands'],
        },
        {
          location: 'HOME',
          equipment: 'bodyweight',
          available: ['bodyweight', 'mat', 'dumbbells', 'bench'],
        },
        {
          location: 'GYM',
          equipment: 'gym',
          available: [
            'bodyweight',
            'mat',
            'dumbbells',
            'bench',
            'barbell',
            'machines',
            'cable',
            'cardio_machine',
          ],
        },
      ];
      const experiences = ['beginner', 'intermediate', 'advanced'];
      const goals = [
        'GENERAL_FITNESS',
        'HYPERTROPHY',
        'STRENGTH',
        'FAT_LOSS',
        'ENDURANCE',
        'MOBILITY',
        'LOWER_BODY',
      ];
      const minutesOptions = [20, 30, 45, 60];
      const weekdays = [1, 2, 3, 4, 5, 6];
      let testedCombinations = 0;

      for (const environment of environments) {
        for (const experience of experiences) {
          for (const goal of goals) {
            for (let daysPerWeek = 1; daysPerWeek <= 6; daysPerWeek += 1) {
              for (const minutesPerSession of minutesOptions) {
                const plan = await service.previewReadyPlan(
                  {
                    experience,
                    daysPerWeek,
                    daysOfWeek: weekdays.slice(0, daysPerWeek),
                    location: environment.location,
                    splitPreference: 'AUTO',
                    goal,
                    healthConditions: [],
                    equipment: environment.equipment,
                    availableEquipment: environment.available,
                    minutesPerSession,
                  } as never,
                  'pt',
                );
                expect(plan.days.length).toBeGreaterThan(0);
                expect(plan.days.every((day) => day.exerciseCount > 0)).toBe(true);
                testedCombinations += 1;
              }
            }
          }
        }
      }
      expect(testedCombinations).toBe(2_016);
    }, 15_000);

    it('nunca seleciona template que exige equipamento indisponivel', async () => {
      const machineTemplate = workoutTemplate('machines-only', 3);
      const bodyweightTemplate = workoutTemplate('bodyweight-only', 3);
      bodyweightTemplate.equipment = 'BODYWEIGHT';
      bodyweightTemplate.daysJson[0]!.exercises[0] = {
        ...bodyweightTemplate.daysJson[0]!.exercises[0]!,
        name: 'Flexao de bracos',
        equipment: ['peso corporal'],
      };
      mockPrisma.workoutTemplate.findMany.mockResolvedValue([machineTemplate, bodyweightTemplate]);
      mockPrisma.workoutPlan.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.workoutPlan.create.mockImplementation(({ data }) => ({
        id: 'plan-bodyweight',
        version: 1,
        rulesVersion: 'catalog-2026-08-12-personalized',
        generatedAt: new Date('2026-08-12T12:00:00Z'),
        ...data,
      }));

      const plan = await service.generateReadyPlan(
        'u1',
        {
          experience: 'beginner',
          daysPerWeek: 3,
          daysOfWeek: [1, 3, 5],
          location: 'HOME',
          splitPreference: 'FULL_BODY',
          goal: 'GENERAL_FITNESS',
          healthConditions: [],
          equipment: 'bodyweight',
          availableEquipment: ['bodyweight'],
          minutesPerSession: 30,
        } as never,
        'pt',
      );

      expect(plan.workoutProfileSnapshot).toEqual(
        expect.objectContaining({ templateSlug: 'bodyweight-only' }),
      );
    });
  });

  describe('sessions', () => {
    it('inicia sessao e publica o estado no journal na mesma transacao', async () => {
      const startedAt = new Date('2026-06-01T00:00:00Z');
      mockPrisma.workoutSession.create.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        planId: 'p1',
        workoutId: 'w1',
        startedAt,
        finishedAt: null,
        durationMin: null,
        completedExercisesJson: [],
      });

      await service.createSession('u1', { planId: 'p1', workoutId: 'w1' } as never);

      expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          entityType: 'WORKOUT_SESSION',
          entityId: 's1',
          action: 'UPSERT',
          occurredAt: startedAt,
        }),
      });
    });

    it('lista sessoes recentes do usuario', async () => {
      mockPrisma.workoutSession.findMany.mockResolvedValue([
        {
          id: 's1',
          planId: 'p1',
          workoutId: 'w1',
          startedAt: new Date('2026-06-01T00:00:00Z'),
          finishedAt: null,
          durationMin: null,
          completedExercisesJson: ['d1-e0'],
        },
      ]);

      const result = await service.listSessions('u1');

      expect(mockPrisma.workoutSession.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { startedAt: 'desc' },
        take: 100,
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: 's1',
          completedExercises: ['d1-e0'],
        }),
      ]);
    });
  });

  describe('updateSession', () => {
    it('finaliza com finishedAt quando finish=true', async () => {
      mockPrisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: 'u1' });
      mockPrisma.workoutSession.update.mockResolvedValue({
        id: 's1',
        planId: 'p1',
        workoutId: 'w1',
        startedAt: new Date('2026-06-01T00:00:00Z'),
        finishedAt: new Date('2026-06-01T01:00:00Z'),
        durationMin: 60,
        completedExercisesJson: ['d1-e0'],
      });
      await service.updateSession('u1', 's1', { finish: true, durationMin: 60 } as never);
      const arg = mockPrisma.workoutSession.update.mock.calls[0][0];
      expect(arg.data.finishedAt).toBeInstanceOf(Date);
      expect(arg.data.durationMin).toBe(60);
    });

    it('lanca NotFound em sessao inexistente', async () => {
      mockPrisma.workoutSession.findFirst.mockResolvedValue(null);
      await expect(service.updateSession('u1', 'x', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleteSession', () => {
    it('exclui uma sessao do proprio usuario e publica o tombstone', async () => {
      mockPrisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: 'u1' });

      await service.deleteSession('u1', 's1');

      expect(mockPrisma.workoutSession.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1' },
      });
      expect(mockPrisma.workoutSession.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          entityType: 'WORKOUT_SESSION',
          entityId: 's1',
          action: 'DELETE',
        }),
      });
    });

    it('lanca NotFound ao excluir sessao inexistente ou de outro usuario', async () => {
      mockPrisma.workoutSession.findFirst.mockResolvedValue(null);

      await expect(service.deleteSession('u1', 'outro-usuario')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockPrisma.workoutSession.delete).not.toHaveBeenCalled();
    });
  });

  describe('swapExercise', () => {
    it('troca por alternativa catalogada equivalente e incrementa a versao', async () => {
      const template = workoutTemplate('abc-fixo', 3);
      const alternativeTemplate = workoutTemplate('alternativas', 3);
      const nextAlternativeTemplate = workoutTemplate('proxima-alternativa', 3);
      alternativeTemplate.daysJson[0]!.exercises[0] = {
        ...alternativeTemplate.daysJson[0]!.exercises[0]!,
        key: 'dumbbellBenchPress',
        name: 'Supino com halteres',
        muscleGroups: ['peito', 'triceps'],
        equipment: ['halteres', 'banco'],
        alternatives: ['supino maquina', 'flexao'],
      };
      nextAlternativeTemplate.daysJson[0]!.exercises[0] = {
        ...nextAlternativeTemplate.daysJson[0]!.exercises[0]!,
        key: 'pushUp',
        name: 'Flexao de bracos',
        muscleGroups: ['peito', 'triceps'],
        equipment: ['peso corporal'],
      };
      const plan = {
        id: 'plan-1',
        userId: 'u1',
        active: true,
        version: 1,
        rulesVersion: 'catalog-2026-07-24',
        name: 'ABC fixo',
        generatedAt: new Date('2026-07-01T00:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        workoutProfileSnapshotJson: {
          experience: 'beginner',
          healthConditions: [],
          templateEquipment: 'GYM',
          availableEquipment: ['machines', 'dumbbells', 'bench'],
        },
        daysJson: [
          {
            dayOfWeek: 1,
            name: 'A - Peito',
            focusArea: 'peito',
            estimatedMinutes: 45,
            exercises: [
              {
                id: 'd1-e0',
                name: 'Supino maquina',
                category: 'STRENGTH',
                muscleGroups: ['peito'],
                sets: 3,
                reps: '10-12',
                restSec: 75,
                instructions: 'Controle.',
                commonMistakes: [],
                alternatives: [{ id: 'supino-halteres', name: 'supino halteres' }],
                safetyNotes: [],
                difficulty: 'beginner',
              },
            ],
          },
        ],
      };
      let updatedDays: unknown;
      mockPrisma.workoutPlan.findFirst.mockResolvedValue(plan);
      mockPrisma.workoutSession.findFirst.mockResolvedValue(null);
      mockPrisma.workoutTemplate.findMany.mockResolvedValue([
        template,
        alternativeTemplate,
        nextAlternativeTemplate,
      ]);
      mockPrisma.workoutPlan.updateMany.mockImplementation(({ data }) => {
        updatedDays = data.daysJson;
        return { count: 1 };
      });
      mockPrisma.workoutPlan.findUniqueOrThrow.mockImplementation(() => ({
        ...plan,
        version: 2,
        daysJson: updatedDays,
      }));
      mockPrisma.planMutation.create.mockResolvedValue({ id: 'mutation-1' });

      const result = await service.swapExercise(
        'u1',
        {
          planId: 'plan-1',
          version: 1,
          dayOfWeek: 1,
          exerciseId: 'd1-e0',
          alternativeId: 'supino-halteres',
        } as never,
        'workout-swap-1',
      );

      expect(result).toMatchObject({
        id: 'plan-1',
        version: 2,
        days: [
          expect.objectContaining({
            exercises: [
              expect.objectContaining({
                id: 'd1-e0',
                name: 'Supino com halteres',
                category: 'STRENGTH',
                alternatives: expect.arrayContaining([
                  { id: 'chestPressMachine', name: 'Supino maquina' },
                  { id: 'pushUp', name: 'Flexao de bracos' },
                ]),
              }),
            ],
          }),
        ],
      });
      expect(mockPrisma.planMutation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          operation: 'WORKOUT_EXERCISE_SWAP',
          beforeJson: expect.objectContaining({ version: 1 }),
          resultJson: expect.objectContaining({ version: 2 }),
        }),
      });
    });

    it.each([
      ['grupo muscular diferente', ['costas'], ['halteres', 'banco']],
      ['equipamento indisponivel', ['peito', 'triceps'], ['barra', 'banco']],
    ])('recusa alternativa catalogada com %s', async (_reason, muscleGroups, equipment) => {
      const template = workoutTemplate('abc-fixo', 3);
      const alternativeTemplate = workoutTemplate('alternativas', 3);
      alternativeTemplate.daysJson[0]!.exercises[0] = {
        ...alternativeTemplate.daysJson[0]!.exercises[0]!,
        key: 'dumbbellBenchPress',
        name: 'Supino com halteres',
        muscleGroups,
        equipment,
      };
      mockPrisma.workoutPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        userId: 'u1',
        active: true,
        version: 1,
        rulesVersion: 'catalog-2026-08-15',
        name: 'Plano',
        generatedAt: new Date(),
        workoutProfileSnapshotJson: {
          experience: 'beginner',
          healthConditions: [],
          templateEquipment: 'GYM',
          availableEquipment: ['machines', 'dumbbells', 'bench'],
        },
        daysJson: [
          {
            dayOfWeek: 1,
            name: 'A - Peito',
            focusArea: 'peito',
            estimatedMinutes: 45,
            exercises: [
              {
                id: 'd1-e0',
                name: 'Supino maquina',
                category: 'STRENGTH',
                muscleGroups: ['peito', 'triceps'],
                restSec: 75,
                instructions: 'Controle.',
                commonMistakes: [],
                alternatives: [{ id: 'dumbbellBenchPress', name: 'Supino com halteres' }],
                safetyNotes: [],
                difficulty: 'beginner',
              },
            ],
          },
        ],
      });
      mockPrisma.workoutSession.findFirst.mockResolvedValue(null);
      mockPrisma.workoutTemplate.findMany.mockResolvedValue([template, alternativeTemplate]);

      await expect(
        service.swapExercise(
          'u1',
          {
            planId: 'plan-1',
            version: 1,
            dayOfWeek: 1,
            exerciseId: 'd1-e0',
            alternativeId: 'dumbbellBenchPress',
          } as never,
          `workout-swap-equivalence-${String(_reason)}`,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALTERNATIVE_NOT_EQUIVALENT' }),
      });
      expect(mockPrisma.workoutPlan.updateMany).not.toHaveBeenCalled();
    });

    it('bloqueia troca enquanto existe sessao ativa do plano', async () => {
      mockPrisma.workoutPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        userId: 'u1',
        active: true,
        version: 1,
        rulesVersion: 'catalog-2026-07-24',
        name: 'Plano',
        generatedAt: new Date(),
        workoutProfileSnapshotJson: { healthConditions: [] },
        daysJson: [],
      });
      mockPrisma.workoutSession.findFirst.mockResolvedValue({ id: 'session-1' });

      await expect(
        service.swapExercise(
          'u1',
          {
            planId: 'plan-1',
            version: 1,
            dayOfWeek: 1,
            exerciseId: 'd1-e0',
            alternativeId: 'supino-halteres',
          } as never,
          'workout-active-session-1',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ACTIVE_WORKOUT_SESSION' }),
      });
      expect(mockPrisma.workoutPlan.updateMany).not.toHaveBeenCalled();
    });
  });
});
