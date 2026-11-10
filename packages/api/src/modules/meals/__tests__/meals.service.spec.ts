import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MealsService } from '../meals.service';
import { PrismaService } from '../../../prisma';
import { SubscriptionAccessService } from '../../billing/subscription-access.service';

// These tests exercise meal-saving domain logic, not free-tier gating, so
// stub the user as already subscribed.
const mockSubscriptionAccess = {
  isSubscribed: jest.fn().mockResolvedValue(true),
  consumeFreeMealLog: jest.fn().mockResolvedValue(true),
};

const mockPrisma = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  meal: {
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  dailyLog: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  streak: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  achievementDefinition: {
    findUnique: jest.fn(),
  },
  userAchievement: {
    upsert: jest.fn(),
  },
  syncChange: {
    create: jest.fn(),
  },
};

describe('MealsService.findById', () => {
  let service: MealsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MealsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubscriptionAccessService, useValue: mockSubscriptionAccess },
      ],
    }).compile();

    service = module.get<MealsService>(MealsService);
    jest.clearAllMocks();
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(true);
    mockSubscriptionAccess.consumeFreeMealLog.mockResolvedValue(true);
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    mockPrisma.streak.findUnique.mockResolvedValue(null);
    mockPrisma.streak.create.mockResolvedValue({ currentStreak: 1 });
    mockPrisma.achievementDefinition.findUnique.mockResolvedValue(null);
    mockPrisma.syncChange.create.mockResolvedValue({ revision: 2n });
  });

  it('deve lancar NotFoundException quando nao existir', async () => {
    mockPrisma.meal.findFirst.mockResolvedValue(null);

    await expect(service.findById('user-1', 'meal-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.meal.findFirst).toHaveBeenCalledWith({
      where: { id: 'meal-x', userId: 'user-1' },
      include: { items: true },
    });
  });

  it('deve retornar refeicao serializada no shape app quando existir', async () => {
    const meal = {
      id: 'meal-1',
      userId: 'user-1',
      type: 'LUNCH',
      items: [],
      totalCalories: 100,
      totalProteinG: 10,
      totalCarbsG: 20,
      totalFatG: 5,
      loggedAt: new Date('2026-06-01T12:00:00Z'),
    };
    mockPrisma.meal.findFirst.mockResolvedValue(meal);

    const result = await service.findById('user-1', 'meal-1');

    expect(result).toMatchObject({
      id: 'meal-1',
      type: 'LUNCH',
      totalCalories: 100,
      totalProtein: 10,
      totalCarbs: 20,
      totalFat: 5,
      items: [],
    });
    expect(Object.keys(result)).not.toContain('userId');
    expect(Object.keys(result)).not.toContain('loggedAt');
  });

  it('deve rejeitar totais absurdos antes de gravar refeicao (shape app)', async () => {
    await expect(
      service.save('user-1', {
        type: 'LUNCH',
        items: [
          {
            name: 'Payload abusivo',
            portion: 100,
            calories: 5000,
            protein: 10,
            carbs: 10,
            fat: 10,
            quantity: 3,
          },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.meal.create).not.toHaveBeenCalled();
    expect(mockPrisma.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('save mapeia shape app -> create recebe campos *G e ignora item.id', async () => {
    mockPrisma.dailyLog.upsert.mockResolvedValue({ id: 'log-1' });
    mockPrisma.dailyLog.update.mockResolvedValue({});
    mockPrisma.meal.create.mockResolvedValue({
      id: 'meal-9',
      type: 'LUNCH',
      items: [],
      totalCalories: 156,
      totalProteinG: 3,
      totalCarbsG: 34,
      totalFatG: 0.4,
      loggedAt: new Date('2026-06-01T12:00:00Z'),
    });

    await service.save('user-1', {
      type: 'LUNCH',
      items: [
        {
          id: 'manual-1',
          name: 'Arroz',
          calories: 156,
          protein: 3,
          carbs: 34,
          fat: 0.4,
          fiber: 1.6,
          portion: 100,
          unit: 'serving',
        },
      ],
    } as never);

    const createArg = mockPrisma.meal.create.mock.calls[0][0];
    const itemCreate = createArg.data.items.create[0];
    expect(itemCreate).toMatchObject({
      name: 'Arroz',
      calories: 156,
      proteinG: 3,
      carbsG: 34,
      fatG: 0.4,
      fiberG: 1.6,
      portionG: 100,
      portionLabel: 'serving',
      quantity: 1,
    });
    expect(Object.keys(itemCreate)).not.toContain('id');
    expect(createArg.data.totalProteinG).toBe(3);
    expect(createArg.data.totalCarbsG).toBe(34);
    expect(createArg.data.totalFatG).toBe(0.4);
    expect(createArg.data.totalFiberG).toBe(1.6);
    expect(mockPrisma.streak.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', currentStreak: 1 }),
    });
    expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        entityType: 'MEAL',
        entityId: 'meal-9',
        action: 'UPSERT',
      }),
    });
  });

  it('save rejeita a gravacao quando o usuario free ja atingiu o limite gratuito', async () => {
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(false);
    mockSubscriptionAccess.consumeFreeMealLog.mockResolvedValue(false);

    await expect(
      service.save('user-1', {
        type: 'LUNCH',
        items: [
          {
            id: 'manual-1',
            name: 'Arroz',
            calories: 100,
            protein: 2,
            carbs: 20,
            fat: 1,
            fiber: 1,
            portion: 100,
            unit: 'serving',
          },
        ],
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FREE_MEAL_LOG_LIMIT_REACHED' }),
    });
    expect(mockPrisma.meal.create).not.toHaveBeenCalled();
  });

  it('save permite a gravacao de um usuario free ainda dentro do limite gratuito', async () => {
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(false);
    mockSubscriptionAccess.consumeFreeMealLog.mockResolvedValue(true);
    mockPrisma.dailyLog.upsert.mockResolvedValue({ id: 'log-1' });
    mockPrisma.meal.create.mockResolvedValue({
      id: 'meal-free-1',
      type: 'LUNCH',
      items: [],
      totalCalories: 100,
      loggedAt: new Date('2026-06-01T12:00:00Z'),
    });

    await service.save('user-1', {
      type: 'LUNCH',
      items: [
        {
          id: 'manual-1',
          name: 'Arroz',
          calories: 100,
          protein: 2,
          carbs: 20,
          fat: 1,
          fiber: 1,
          portion: 100,
          unit: 'serving',
        },
      ],
    } as never);

    expect(mockSubscriptionAccess.consumeFreeMealLog).toHaveBeenCalledWith('user-1', mockPrisma);
    expect(mockPrisma.meal.create).toHaveBeenCalled();
  });

  it('save separa as calorias pela meia-noite no fuso do usuario', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-14T02:30:00.000Z'));
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
    mockPrisma.dailyLog.upsert.mockResolvedValue({ id: 'log-1' });
    mockPrisma.dailyLog.update.mockResolvedValue({});
    mockPrisma.meal.create.mockResolvedValue({
      id: 'meal-local-day',
      type: 'DINNER',
      items: [],
      totalCalories: 100,
      totalProteinG: 10,
      totalCarbsG: 10,
      totalFatG: 2,
      loggedAt: new Date(),
    });

    try {
      await service.save('user-1', {
        type: 'DINNER',
        items: [
          {
            name: 'Jantar',
            calories: 100,
            protein: 10,
            carbs: 10,
            fat: 2,
            portion: 1,
            unit: 'porcao',
          },
        ],
      } as never);

      const expectedDate = new Date('2026-08-13T00:00:00.000Z');
      expect(mockPrisma.dailyLog.upsert).toHaveBeenCalledWith({
        where: { userId_date: { userId: 'user-1', date: expectedDate } },
        update: {},
        create: { userId: 'user-1', date: expectedDate },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('save reutiliza a refeicao quando a mesma chave idempotente ja foi concluida', async () => {
    const existing = {
      id: 'meal-existing',
      type: 'LUNCH',
      items: [],
      totalCalories: 420,
      totalProteinG: 35,
      totalCarbsG: 40,
      totalFatG: 12,
      totalFiberG: 6,
      loggedAt: new Date('2026-08-13T12:00:00Z'),
    };
    mockPrisma.meal.findFirst.mockResolvedValue(existing);

    const result = await service.save(
      'user-1',
      {
        type: 'LUNCH',
        items: [
          {
            name: 'Refeicao do plano',
            calories: 420,
            protein: 35,
            carbs: 40,
            fat: 12,
            fiber: 6,
            portion: 1,
            unit: 'porcao',
          },
        ],
      } as never,
      'diet-plan:meal-1:2026-08-13',
    );

    expect(result.id).toBe('meal-existing');
    expect(mockPrisma.meal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', idempotencyKey: 'diet-plan:meal-1:2026-08-13' },
      include: { items: true },
    });
    expect(mockPrisma.meal.create).not.toHaveBeenCalled();
    expect(mockPrisma.dailyLog.update).not.toHaveBeenCalled();
    expect(mockPrisma.streak.create).not.toHaveBeenCalled();
    expect(mockPrisma.syncChange.create).not.toHaveBeenCalled();
  });

  it('save persiste a chave idempotente da refeicao planejada', async () => {
    mockPrisma.meal.findFirst.mockResolvedValue(null);
    mockPrisma.dailyLog.upsert.mockResolvedValue({ id: 'log-1' });
    mockPrisma.dailyLog.update.mockResolvedValue({});
    mockPrisma.meal.create.mockResolvedValue({
      id: 'meal-10',
      type: 'DINNER',
      items: [],
      totalCalories: 390,
      totalProteinG: 32,
      totalCarbsG: 28,
      totalFatG: 15,
      loggedAt: new Date('2026-08-13T20:00:00Z'),
    });

    await service.save(
      'user-1',
      {
        type: 'DINNER',
        items: [
          {
            name: 'Jantar planejado',
            calories: 390,
            protein: 32,
            carbs: 28,
            fat: 15,
            portion: 1,
            unit: 'porcao',
          },
        ],
      } as never,
      'diet-plan:dinner:2026-08-13',
    );

    expect(mockPrisma.meal.create.mock.calls[0][0].data.idempotencyKey).toBe(
      'diet-plan:dinner:2026-08-13',
    );
    expect(mockPrisma.dailyLog.update.mock.calls[0][0].data).not.toHaveProperty('scansUsed');
  });

  it('save recupera o registro vencedor quando dois requests idempotentes concorrem', async () => {
    const existing = {
      id: 'meal-race-winner',
      type: 'LUNCH',
      items: [],
      totalCalories: 420,
      totalProteinG: 35,
      totalCarbsG: 40,
      totalFatG: 12,
      totalFiberG: 6,
      loggedAt: new Date('2026-08-13T12:00:00Z'),
    };
    mockPrisma.meal.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    mockPrisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique constraint', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: 'meals_userId_idempotencyKey_key' },
      }),
    );

    const result = await service.save(
      'user-1',
      {
        type: 'LUNCH',
        items: [
          {
            name: 'Refeicao planejada',
            calories: 420,
            protein: 35,
            carbs: 40,
            fat: 12,
            fiber: 6,
            portion: 1,
            unit: 'porcao',
          },
        ],
      } as never,
      'diet-plan:race:2026-08-13',
    );

    expect(result.id).toBe('meal-race-winner');
    expect(mockPrisma.meal.findFirst).toHaveBeenCalledTimes(2);
  });

  it('save retorna shape app (serializeMeal) sem campos internos', async () => {
    mockPrisma.dailyLog.upsert.mockResolvedValue({ id: 'log-1' });
    mockPrisma.dailyLog.update.mockResolvedValue({});
    mockPrisma.meal.create.mockResolvedValue({
      id: 'meal-9',
      userId: 'user-1',
      dailyLogId: 'log-1',
      type: 'LUNCH',
      totalCalories: 156,
      totalProteinG: 3,
      totalCarbsG: 34,
      totalFatG: 0.4,
      loggedAt: new Date('2026-06-01T12:00:00Z'),
      items: [
        {
          id: 'item-1',
          name: 'Arroz',
          calories: 156,
          proteinG: 3,
          carbsG: 34,
          fatG: 0.4,
          portionG: 100,
          portionLabel: 'serving',
        },
      ],
    });

    const result = await service.save('user-1', {
      type: 'LUNCH',
      items: [
        {
          name: 'Arroz',
          calories: 156,
          protein: 3,
          carbs: 34,
          fat: 0.4,
          portion: 100,
          unit: 'serving',
        },
      ],
    } as never);

    expect(result).toMatchObject({
      id: 'meal-9',
      totalProtein: 3,
      totalCarbs: 34,
      totalFat: 0.4,
      items: [{ protein: 3, carbs: 34, fat: 0.4, portion: 100, unit: 'serving' }],
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(Object.keys(result)).not.toContain('userId');
    expect(Object.keys(result)).not.toContain('dailyLogId');
  });

  it('findByUser retorna array puro serializado (mais novo primeiro), sem envelope', async () => {
    mockPrisma.meal.findMany.mockResolvedValue([
      {
        id: 'meal-2',
        type: 'DINNER',
        totalCalories: 300,
        totalProteinG: 20,
        totalCarbsG: 30,
        totalFatG: 10,
        loggedAt: new Date('2026-06-02T20:00:00Z'),
        items: [],
        userId: 'user-1',
        dailyLogId: 'log-1',
      },
    ]);

    const result = await service.findByUser('user-1', 10, 0);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'meal-2',
      totalProtein: 20,
      totalCarbs: 30,
      totalFat: 10,
    });
    expect(Object.keys(result[0]!)).not.toContain('userId');
    expect(result).not.toHaveProperty('meals');
    expect(result).not.toHaveProperty('total');
  });

  it('findByUser retorna o intervalo de datas completo sem o limite legado de 50 linhas', async () => {
    mockPrisma.meal.findMany.mockResolvedValue([]);
    const from = new Date('2026-08-06T03:00:00.000Z');
    const to = new Date('2026-08-13T03:00:00.000Z');

    await service.findByUser('user-1', undefined, undefined, from, to);

    expect(mockPrisma.meal.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', loggedAt: { gte: from, lt: to } },
      include: { items: true },
      orderBy: { loggedAt: 'desc' },
    });
  });

  it('delete remove refeicao e nao retorna row crua', async () => {
    mockPrisma.meal.findFirst.mockResolvedValue({
      id: 'meal-1',
      dailyLogId: 'log-1',
      totalCalories: 100,
      totalProteinG: 10,
      totalCarbsG: 20,
      totalFatG: 5,
    });
    mockPrisma.dailyLog.update.mockResolvedValue({});
    mockPrisma.meal.delete.mockResolvedValue({ id: 'meal-1', userId: 'user-1' });

    const result = await service.delete('user-1', 'meal-1');

    expect(result).toBeUndefined();
    expect(mockPrisma.meal.delete).toHaveBeenCalledWith({ where: { id: 'meal-1' } });
    expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        entityType: 'MEAL',
        entityId: 'meal-1',
        action: 'DELETE',
      }),
    });
  });
});
