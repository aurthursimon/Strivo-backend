import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from '../onboarding.service';
import { DietService } from '../../diet';
import { WorkoutService } from '../../workout';
import { Glp1Service } from '../../glp1';
import { PrismaService } from '../../../prisma';

const mockDiet = { generateReadyPlan: jest.fn(), previewReadyPlan: jest.fn() };
const mockWorkout = {
  generateReadyPlan: jest.fn(),
  previewReadyPlan: jest.fn(),
  assertProfileAllowed: jest.fn(),
  classifyProfile: jest.fn(),
};
const mockGlp1 = { setupFromOnboarding: jest.fn() };
const mockTx = {
  $queryRaw: jest.fn(),
  goal: { updateMany: jest.fn(), create: jest.fn() },
  user: { update: jest.fn() },
  dietProfile: { upsert: jest.fn() },
  consent: { createMany: jest.fn() },
  workoutProfile: { upsert: jest.fn() },
  notificationPreference: { upsert: jest.fn() },
  syncChange: { create: jest.fn() },
  onboardingSubmission: { update: jest.fn() },
};
const mockPrisma = {
  $transaction: jest.fn(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx)),
  notificationPreference: {
    upsert: jest.fn(),
  },
  onboardingSubmission: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
};

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DietService, useValue: mockDiet },
        { provide: WorkoutService, useValue: mockWorkout },
        { provide: Glp1Service, useValue: mockGlp1 },
      ],
    }).compile();

    service = module.get(OnboardingService);
    jest.clearAllMocks();
    mockPrisma.onboardingSubmission.findUnique.mockResolvedValue(null);
    mockPrisma.onboardingSubmission.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ onboardingCompleted: false });
    mockPrisma.onboardingSubmission.create.mockResolvedValue({ id: 'submission-1' });
    mockPrisma.onboardingSubmission.update.mockResolvedValue({ id: 'submission-1' });
    mockPrisma.onboardingSubmission.updateMany.mockResolvedValue({ count: 1 });
    mockTx.goal.create.mockImplementation(({ data }) => ({ id: 'goal-1', ...data }));
    mockTx.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    mockTx.notificationPreference.upsert.mockResolvedValue({
      id: 'pref-1',
      userId: 'user-1',
      pushEnabled: true,
      breakfast: false,
      breakfastTime: '07:00',
      lunch: false,
      lunchTime: '12:00',
      afternoonSnack: false,
      afternoonSnackTime: '15:00',
      dinner: false,
      dinnerTime: '19:00',
      water: false,
      waterIntervalH: 2,
      waterStartTime: '08:00',
      waterEndTime: '22:00',
      workout: false,
      workoutTime: '18:00',
      workoutDaysJson: [1, 3, 5],
      progressCheck: false,
      progressCheckTime: '09:00',
      progressCheckWeekday: 1,
      streakRisk: false,
      streakRiskTime: '21:00',
      syncOccurredAt: null,
      syncSequence: null,
      updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    });
    mockDiet.previewReadyPlan.mockResolvedValue({
      mealsPerDay: 4,
      days: [{ dayOfWeek: 1, plannedCalories: 2100, meals: [] }],
    });
    mockDiet.generateReadyPlan.mockResolvedValue({
      id: 'diet-plan-1',
      generatedAt: new Date('2026-08-24T00:00:00Z'),
      dietProfileSnapshot: { mealsPerDay: 4 },
      days: [],
    });
    mockWorkout.previewReadyPlan.mockResolvedValue({
      name: 'Treino inicial',
      daysPerWeek: 3,
      minutesPerSession: 45,
      days: [],
    });
    mockWorkout.classifyProfile.mockReturnValue('SAFE');
    mockTx.user.update.mockResolvedValue({
      id: 'user-1',
      email: null,
      provider: 'GUEST',
      onboardingCompleted: true,
    });
    mockGlp1.setupFromOnboarding.mockResolvedValue({ treatment: { id: 'tr-1' } });
  });

  it('salva metas e devolve a dieta pronta sem gerar treino no onboarding', async () => {
    const result = await service.complete(
      'user-1',
      {
        birthDate: '1996-01-15',
        sex: 'MALE',
        heightCm: 180,
        weightKg: 80,
        exerciseLevel: 'MODERATE',
        dietStyle: 'carnivora',
        objective: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        weeklyGoalKg: 0.65,
        targetWeightKg: 74,
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        measurementSystem: 'METRIC',
        regionDetectionSource: 'DEVICE_REGION',
        mealsPerDay: 4,
        restrictions: [],
        dislikedFoods: [],
        experience: 'beginner',
        workoutDaysPerWeek: 3,
        workoutEquipment: 'gym',
        workoutMinutesPerSession: 45,
        healthConditions: [],
        notificationsOptIn: true,
      } as never,
      'pt',
      'onboarding-test-1',
    );

    expect(mockTx.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        weeklyGoalKg: 0.65,
        targetWeightKg: 74,
        waterMl: 3300,
        dailyCalories: result.calculations.calories,
        algorithmVersion: 'mifflin-st-jeor-v5-disclosed-adult-targets',
        calculationInputJson: expect.objectContaining({
          gender: 'MALE',
          weightKg: 80,
          heightCm: 180,
          activityLevel: 'MODERATE',
          weeklyGoalKg: 0.65,
          dietType: 'CARNIVORE',
        }),
      }),
    });
    expect(mockTx.dietProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          goalType: 'LOSE',
          dietType: 'CARNIVORE',
          targetCalories: result.calculations.calories,
        }),
      }),
    );
    expect(mockTx.workoutProfile.upsert).not.toHaveBeenCalled();
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        dietType: 'CARNIVORE',
        activityLevel: 'MODERATE',
        gender: 'MALE',
        exerciseCalories: true,
        rolloverCalories: false,
        onboardingCompleted: true,
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        measurementSystem: 'METRIC',
        regionDetectionSource: 'DEVICE_REGION',
      }),
    });
    expect(mockTx.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', pushEnabled: true },
      update: {
        pushEnabled: true,
        syncOccurredAt: null,
        syncMutationId: null,
        syncInstallationId: null,
        syncSequence: null,
      },
    });
    expect(mockTx.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        entityType: 'NOTIFICATION_PREFERENCES',
        entityId: 'pref-1',
        action: 'UPSERT',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-1', onboardingCompleted: true }),
        goal: expect.objectContaining({ id: 'goal-1', calories: expect.any(Number), fiberG: 0 }),
        onboardingStatus: 'COMPLETED',
        planStatus: 'READY',
        dietPlan: expect.objectContaining({ id: 'diet-plan-1' }),
        dietPlanStatus: 'READY',
        workoutPlan: null,
        workoutPlanStatus: 'ABSENT',
        calculations: expect.objectContaining({ fiberG: 0, waterMl: 3300 }),
      }),
    );
    expect(mockDiet.generateReadyPlan).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ dietType: 'CARNIVORE' }),
    );
    expect(mockPrisma.onboardingSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('exige nivel de atividade para calcular calorias', async () => {
    await expect(
      service.complete(
        'user-1',
        {
          birthDate: '1996-01-15',
          gender: 'MALE',
          heightCm: 180,
          weightKg: 80,
          dietType: 'omnivore',
          goalType: 'MAINTAIN',
          experience: 'beginner',
        } as never,
        'pt',
        'onboarding-test-2',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conclui com dieta pronta e treino ausente sem prescricao automatica', async () => {
    mockWorkout.classifyProfile.mockReturnValue('BLOCKED');

    const result = await service.complete(
      'user-1',
      {
        birthDate: '1996-01-15',
        gender: 'MALE',
        heightCm: 180,
        weightKg: 80,
        activityLevel: 'MODERATE',
        dietType: 'omnivore',
        goalType: 'MAINTAIN',
        healthConditions: ['recent-heart-surgery'],
      } as never,
      'pt',
      'onboarding-safety-block',
    );

    expect(result).toEqual(
      expect.objectContaining({
        onboardingStatus: 'COMPLETED',
        dietPlanStatus: 'READY',
        workoutPlanStatus: 'ABSENT',
      }),
    );
    expect(mockDiet.generateReadyPlan).toHaveBeenCalledTimes(1);
  });

  it('gera uma previa sem criar usuario, meta ou submissao', async () => {
    const preview = await service.preview(
      {
        birthDate: '1996-01-15',
        gender: 'MALE',
        heightCm: 180,
        weightKg: 80,
        activityLevel: 'MODERATE',
        dietType: 'omnivore',
        goalType: 'LOSE_WEIGHT',
        targetWeightKg: 74,
      } as never,
      'pt',
    );

    expect(mockDiet.previewReadyPlan).toHaveBeenCalledWith(
      expect.objectContaining({ goalType: 'LOSE', dietType: 'OMNIVORE' }),
      'pt',
    );
    expect(mockWorkout.previewReadyPlan).not.toHaveBeenCalled();
    expect(preview).toEqual(
      expect.objectContaining({
        nutrition: expect.objectContaining({
          calories: expect.any(Number),
          fiberG: expect.any(Number),
          waterMl: 3300,
        }),
        diet: expect.objectContaining({ mealsPerDay: 4 }),
        workout: null,
        workoutStatus: 'ABSENT',
      }),
    );
    expect(mockTx.user.update).not.toHaveBeenCalled();
    expect(mockTx.goal.create).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingSubmission.create).not.toHaveBeenCalled();
  });

  it('rejeita uma previa nutricional para menores de 18 anos', async () => {
    const minorBirthDate = new Date();
    minorBirthDate.setUTCFullYear(minorBirthDate.getUTCFullYear() - 17);

    await expect(
      service.preview(
        {
          birthDate: minorBirthDate.toISOString().slice(0, 10),
          gender: 'FEMALE',
          heightCm: 165,
          weightKg: 60,
          activityLevel: 'LIGHT',
          dietType: 'omnivore',
          goalType: 'MAINTAIN',
        } as never,
        'pt',
      ),
    ).rejects.toThrow('birthDate fora da faixa aceita');
    expect(mockDiet.previewReadyPlan).not.toHaveBeenCalled();
  });

  it('materializa o snapshot GLP-1 do mobile sem inventar horario de dose', async () => {
    const glp1 = {
      medication: 'Mounjaro',
      medicationMarket: 'BRAZIL',
      medicationCountryCode: 'BR',
      doseMg: 2.5,
      intervalDays: 7,
      lastDoseDate: '2026-07-19',
      cravingPeakDay: 5,
    };

    const result = await service.complete(
      'user-1',
      {
        birthDate: '1996-01-15',
        gender: 'MALE',
        heightCm: 180,
        weightKg: 80,
        activityLevel: 'MODERATE',
        dietType: 'omnivore',
        goalType: 'MAINTAIN',
        glp1,
        timezone: 'America/Sao_Paulo',
        consents: [
          {
            type: 'glp1_tracking',
            version: '1.0.0',
            scopes: ['treatment', 'dose', 'symptoms', 'exposure'],
            acceptedAt: '2026-07-21T12:00:00Z',
          },
          {
            type: 'terms_of_use',
            version: '1.0.0',
            scopes: ['terms_of_use'],
            acceptedAt: '2026-07-21T12:00:00Z',
          },
          {
            type: 'nutrition_sources',
            version: '2026-08-23',
            scopes: ['calories', 'protein', 'water'],
            acceptedAt: '2026-07-21T12:00:00Z',
          },
        ],
      } as never,
      'pt',
      'onboarding-test-3',
    );

    expect(mockGlp1.setupFromOnboarding).toHaveBeenCalledWith(
      'user-1',
      glp1,
      'America/Sao_Paulo',
      expect.objectContaining({ type: 'glp1_tracking', version: '1.0.0' }),
    );
    expect(mockTx.consent.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          type: 'terms_of_use',
          version: '1.0.0',
          accepted: true,
        },
        {
          userId: 'user-1',
          type: 'nutrition_sources',
          version: '2026-08-23',
          accepted: true,
        },
      ],
    });
    expect(result.glp1Setup).toEqual({ treatment: { id: 'tr-1' } });
  });

  it('rejeita onboarding GLP-1 sem aceite dos termos e ciencia das fontes', async () => {
    await expect(
      service.complete(
        'user-1',
        {
          birthDate: '1996-01-15',
          gender: 'MALE',
          heightCm: 180,
          weightKg: 80,
          activityLevel: 'MODERATE',
          dietType: 'omnivore',
          goalType: 'MAINTAIN',
          glp1: {
            medication: 'Mounjaro',
            doseMg: 2.5,
            intervalDays: 7,
          },
          consents: [
            {
              type: 'glp1_tracking',
              version: '1.0.0',
              scopes: ['treatment', 'dose', 'symptoms'],
              acceptedAt: '2026-07-21T12:00:00Z',
            },
          ],
        } as never,
        'pt',
        'onboarding-missing-acknowledgements',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ONBOARDING_ACKNOWLEDGEMENTS_REQUIRED' }),
    });
    expect(mockGlp1.setupFromOnboarding).not.toHaveBeenCalled();
    expect(mockTx.consent.createMany).not.toHaveBeenCalled();
  });

  it('reutiliza o resultado concluido para a mesma chave e payload', async () => {
    const resultJson = {
      user: { id: 'user-1', onboardingCompleted: true },
      goal: { id: 'goal-1', fiberG: 29 },
      calculations: {
        ageYears: 30,
        bmr: 1700,
        tdee: 2200,
        calories: 2100,
        protein: 150,
        carbs: 200,
        fat: 70,
        fiberG: 29,
        waterMl: 2800,
      },
      dietPlan: { id: 'diet-1' },
      dietPlanStatus: 'READY',
      workoutPlan: { id: 'workout-1' },
      workoutPlanStatus: 'READY',
      glp1Setup: null,
    };
    const dto = {
      birthDate: '1996-01-15',
      gender: 'MALE',
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'MODERATE',
      dietType: 'omnivore',
      goalType: 'MAINTAIN',
    };
    const { createHash } = await import('crypto');
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ dto, locale: 'pt' }))
      .digest('hex');
    mockPrisma.onboardingSubmission.findUnique.mockResolvedValue({
      id: 'submission-1',
      requestHash,
      status: 'COMPLETED',
      resultJson,
    });

    await expect(
      service.complete('user-1', dto as never, 'pt', 'onboarding-replay'),
    ).resolves.toEqual(resultJson);
    expect(mockTx.goal.create).not.toHaveBeenCalled();
    expect(mockDiet.generateReadyPlan).not.toHaveBeenCalled();
  });

  it('gera e persiste o plano de treino quando solicitado no onboarding com dias da semana', async () => {
    mockWorkout.generateReadyPlan.mockResolvedValue({
      id: 'workout-plan-1',
      name: 'Full Body 3D',
      days: [],
    });

    const result = await service.complete(
      'user-1',
      {
        birthDate: '1996-01-15',
        gender: 'MALE',
        heightCm: 180,
        weightKg: 80,
        workouts: 'moderate',
        dietType: 'omnivore',
        goalType: 'LOSE',
        targetWeightKg: 74,
        planProvisioning: {
          calculateNutritionTargets: true,
          generateDietPlan: true,
          generateWorkoutPlan: true,
          source: 'ONBOARDING',
        },
        workoutDaysOfWeek: [1, 3, 5],
        workoutDaysPerWeek: 3,
        workoutExperience: 'intermediate',
        workoutLocation: 'GYM',
        workoutMinutesPerSession: 45,
      } as never,
      'en',
      'workout-onboarding-key',
    );

    expect(result.workoutPlanStatus).toBe('READY');
    expect(result.workoutPlan).toEqual(expect.objectContaining({ id: 'workout-plan-1' }));
    expect(mockWorkout.generateReadyPlan).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        daysOfWeek: [1, 3, 5],
        daysPerWeek: 3,
        experience: 'intermediate',
        minutesPerSession: 45,
        location: 'GYM',
      }),
      'en',
    );
  });
});
