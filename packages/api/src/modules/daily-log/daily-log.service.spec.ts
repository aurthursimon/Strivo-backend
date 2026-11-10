import { DailyLogService } from './daily-log.service';

const log = {
  id: 'log-1',
  date: new Date('2026-06-01T00:00:00Z'),
  totalCalories: 0,
  totalProteinG: 0,
  totalCarbsG: 0,
  totalFatG: 0,
  totalWaterMl: 350,
  targetCalories: null,
  targetProteinG: null,
  targetCarbsG: null,
  targetFatG: null,
  weightKg: null,
};

describe('DailyLogService', () => {
  const prisma = {
    $transaction: jest.fn(),
    dailyLog: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    goal: { findFirst: jest.fn() },
    meal: { count: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    waterEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const sync = {
    executeLegacyCommand: jest.fn(),
    removeLegacyWater: jest.fn(),
  };
  let service: DailyLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.dailyLog.findUnique.mockResolvedValue(log);
    prisma.goal.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    prisma.meal.count.mockResolvedValue(0);
    prisma.dailyLog.update.mockResolvedValue({});
    prisma.dailyLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.waterEntry.create.mockResolvedValue({ id: 'entry-1' });
    sync.executeLegacyCommand.mockResolvedValue({ status: 'APPLIED' });
    sync.removeLegacyWater.mockResolvedValue(true);
    service = new DailyLogService(prisma as never, sync as never);
  });

  it('encaminha clientMutationId legado ao mesmo ledger de sync', async () => {
    const first = await service.addWater('user-1', 350, 'water-1');
    const second = await service.addWater('user-1', 350, 'water-1');

    expect(first.water.consumed).toBe(350);
    expect(second.water.consumed).toBe(350);
    expect(sync.executeLegacyCommand).toHaveBeenCalledTimes(2);
    expect(sync.executeLegacyCommand).toHaveBeenNthCalledWith(1, 'user-1', {
      operation: 'WATER_ADD',
      payload: { amountMl: 350 },
      mutationId: 'water-1',
      dayOverride: undefined,
    });
  });

  it('mantem compatibilidade sem clientMutationId', async () => {
    await service.addWater('user-1', 250);

    expect(sync.executeLegacyCommand).toHaveBeenCalledWith('user-1', {
      operation: 'WATER_ADD',
      payload: { amountMl: 250 },
      mutationId: undefined,
      dayOverride: undefined,
    });
  });

  it('continua registrando agua acima da meta de acompanhamento', async () => {
    await service.addWater('user-1', 500);

    expect(sync.executeLegacyCommand).toHaveBeenCalledWith('user-1', {
      operation: 'WATER_ADD',
      payload: { amountMl: 500 },
      mutationId: undefined,
      dayOverride: undefined,
    });
  });

  it('encaminha peso legado ao handler canonico que aplica os efeitos de negocio', async () => {
    await service.logWeight('user-1', 79.5);

    expect(sync.executeLegacyCommand).toHaveBeenCalledWith('user-1', {
      operation: 'WEIGHT_LOG',
      payload: { weightKg: 79.5 },
    });
  });

  it('encaminha exclusao legada para journal e preserva retorno nulo', async () => {
    sync.removeLegacyWater.mockResolvedValueOnce(false);

    await expect(service.removeWater('user-1', 'missing')).resolves.toBeNull();
    expect(sync.removeLegacyWater).toHaveBeenCalledWith('user-1', 'missing');
  });

  it('rejeita data legada anterior a janela de 365 dias', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    prisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });

    try {
      await expect(service.addWater('user-1', 350, undefined, '2025-08-24')).rejects.toThrow(
        'ultimos 365 dias',
      );
      expect(sync.executeLegacyCommand).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('vira agua e calorias na meia-noite do fuso do usuario', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-14T02:30:00.000Z'));
    prisma.user.findUnique.mockResolvedValue({ timezone: 'America/Sao_Paulo' });

    try {
      await service.getToday('user-1');

      expect(prisma.dailyLog.findUnique).toHaveBeenCalledWith({
        where: {
          userId_date: {
            userId: 'user-1',
            date: new Date('2026-08-13T00:00:00.000Z'),
          },
        },
        include: { waterEntries: { orderBy: { loggedAt: 'desc' } } },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('lista as entradas de agua de hoje, sem campos internos', async () => {
    prisma.dailyLog.findUnique.mockResolvedValueOnce({
      ...log,
      waterEntries: [
        { id: 'entry-2', amountMl: 500, loggedAt: new Date('2026-06-01T18:00:00Z') },
        { id: 'entry-1', amountMl: 250, loggedAt: new Date('2026-06-01T09:00:00Z') },
      ],
    });

    const result = await service.getTodayWaterEntries('user-1');

    expect(result).toEqual([
      { id: 'entry-2', amountMl: 500, loggedAt: '2026-06-01T18:00:00.000Z' },
      { id: 'entry-1', amountMl: 250, loggedAt: '2026-06-01T09:00:00.000Z' },
    ]);
  });

  it('serializa historico sem retornar campos crus do Prisma', async () => {
    prisma.dailyLog.findMany.mockResolvedValue([log]);

    const result = await service.getHistory('user-1', 7);

    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        water: { consumed: 350, goal: 0 },
        mealsCount: 0,
      }),
    ]);
    expect(Object.keys(result[0]!)).not.toContain('userId');
    expect(Object.keys(result[0]!)).not.toContain('totalWaterMl');
  });
});
