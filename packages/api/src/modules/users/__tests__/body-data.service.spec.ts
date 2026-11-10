import { Test } from '@nestjs/testing';
import { BodyDataService } from '../body-data.service';
import { PrismaService } from '../../../prisma';
import { DietService } from '../../diet';
import { WorkoutService } from '../../workout';

const mockPrisma = {
  $transaction: jest.fn(),
  user: { findFirst: jest.fn(), update: jest.fn() },
  goal: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  dietProfile: { findUnique: jest.fn() },
  workoutProfile: { findUnique: jest.fn() },
};

const mockDiet = {
  generateReadyPlan: jest.fn(),
  upsertProfile: jest.fn(),
  getProfile: jest.fn(),
  getActivePlan: jest.fn(),
};
const mockWorkout = {
  assertProfileAllowed: jest.fn(),
  generateReadyPlan: jest.fn(),
  upsertProfile: jest.fn(),
  getProfile: jest.fn(),
  getActivePlan: jest.fn(),
};

describe('BodyDataService', () => {
  let service: BodyDataService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BodyDataService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DietService, useValue: mockDiet },
        { provide: WorkoutService, useValue: mockWorkout },
      ],
    }).compile();

    service = module.get(BodyDataService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Matheus',
      birthDate: null,
      gender: null,
      heightCm: null,
      weightKg: null,
      activityLevel: null,
      dietType: null,
      exerciseCalories: false,
      rolloverCalories: false,
      notificationsOptIn: false,
      deletedAt: null,
    });
    mockPrisma.goal.findFirst.mockResolvedValue(null);
    mockPrisma.goal.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.dietProfile.findUnique.mockResolvedValue(null);
    mockPrisma.workoutProfile.findUnique.mockResolvedValue(null);
    mockPrisma.goal.create.mockImplementation(({ data }) => ({
      id: 'goal-1',
      createdAt: new Date('2026-07-04T00:00:00Z'),
      ...data,
    }));
    mockPrisma.user.update.mockResolvedValue({
      id: 'u1',
      email: 'matheus@example.com',
      name: 'Matheus',
      birthDate: new Date('1995-01-01T00:00:00Z'),
      gender: 'MALE',
      heightCm: 178,
      weightKg: 82,
      activityLevel: 'MODERATE',
      dietType: 'OMNIVORE',
      exerciseCalories: false,
      rolloverCalories: false,
      notificationsOptIn: true,
      onboardingCompleted: true,
    });
    mockDiet.generateReadyPlan.mockResolvedValue({ id: 'diet-plan-1', days: [] });
    mockDiet.getProfile.mockResolvedValue({ dietType: 'OMNIVORE', targetCalories: 2100 });
    mockWorkout.generateReadyPlan.mockResolvedValue({ id: 'workout-plan-1', days: [] });
    mockWorkout.getProfile.mockResolvedValue({ experience: 'beginner', daysPerWeek: 3 });
  });

  it('recalcula meta e dieta sem gerar ou substituir treino automaticamente', async () => {
    const result = await service.update(
      'u1',
      {
        birthDate: '1995-01-01',
        gender: 'MALE',
        heightCm: 178,
        weightKg: 82,
        workouts: 'MODERATE',
        dietType: 'omnivore',
        goalType: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        targetWeightKg: 75,
        notificationsOptIn: true,
      } as never,
      'pt',
    );

    expect(mockWorkout.assertProfileAllowed).not.toHaveBeenCalled();
    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        dailyCalories: expect.any(Number),
        dailyFiberG: expect.any(Number),
        waterMl: expect.any(Number),
      }),
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          activityLevel: 'MODERATE',
          dietType: 'OMNIVORE',
          notificationsOptIn: true,
          onboardingCompleted: true,
        }),
      }),
    );
    expect(result.user).toEqual(
      expect.objectContaining({
        activityLevel: 'moderate',
        dietType: 'omnivore',
      }),
    );
    expect(mockDiet.generateReadyPlan).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        goalType: 'LOSE',
        dietType: 'OMNIVORE',
        targetCalories: expect.any(Number),
      }),
    );
    expect(mockWorkout.generateReadyPlan).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.any(Object),
        goal: expect.objectContaining({ id: 'goal-1', fiberG: expect.any(Number), type: 'LOSE' }),
        dietPlan: { id: 'diet-plan-1', days: [] },
        workoutPlan: undefined,
      }),
    );
  });

  it('nao consulta seguranca de treino ao atualizar apenas os dados corporais', async () => {
    await service.update(
      'u1',
      {
        birthDate: '1995-01-01',
        gender: 'MALE',
        heightCm: 178,
        weightKg: 82,
        workouts: 'MODERATE',
        dietType: 'omnivore',
        goalType: 'LOSE_WEIGHT',
      } as never,
      'pt',
    );

    expect(mockPrisma.goal.create).toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalled();
    expect(mockDiet.generateReadyPlan).toHaveBeenCalled();
    expect(mockWorkout.assertProfileAllowed).not.toHaveBeenCalled();
    expect(mockWorkout.generateReadyPlan).not.toHaveBeenCalled();
  });
});
