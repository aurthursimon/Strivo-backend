import { DailyLogService } from '../daily-log.service';

describe('DailyLogService - peso', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    dailyLog: { findUnique: jest.fn(), findMany: jest.fn() },
    goal: { findFirst: jest.fn() },
    meal: { count: jest.fn() },
    weightEntry: { findMany: jest.fn() },
  };
  const syncService = {
    removeLegacyWeight: jest.fn(),
  };
  let service: DailyLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
    prisma.goal.findFirst.mockResolvedValue(null);
    prisma.meal.count.mockResolvedValue(0);
    prisma.dailyLog.findUnique.mockResolvedValue({
      id: 'log-1',
      date: new Date('2026-08-25T00:00:00.000Z'),
      waterEntries: [],
      weightKg: null,
    });
    service = new DailyLogService(prisma as never, syncService as never);
  });

  it('lista entradas de peso do periodo pedido, da mais recente para a mais antiga', async () => {
    const entries = [
      { id: 'w-2', weightKg: 79.5, measuredAt: new Date('2026-08-20T08:00:00.000Z') },
      { id: 'w-1', weightKg: 80.1, measuredAt: new Date('2026-08-10T08:00:00.000Z') },
    ];
    prisma.weightEntry.findMany.mockResolvedValue(entries);

    const result = await service.listWeightEntries('user-1', 30);

    expect(prisma.weightEntry.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', measuredAt: { gte: expect.any(Date) } },
      orderBy: { measuredAt: 'desc' },
    });
    expect(result).toEqual([
      { id: 'w-2', weightKg: 79.5, measuredAt: '2026-08-20T08:00:00.000Z' },
      { id: 'w-1', weightKg: 80.1, measuredAt: '2026-08-10T08:00:00.000Z' },
    ]);
  });

  it('rejeita um intervalo de dias fora do permitido', async () => {
    await expect(service.listWeightEntries('user-1', 0)).rejects.toThrow(
      'O parametro days deve estar entre 1 e 365.',
    );
    await expect(service.listWeightEntries('user-1', 400)).rejects.toThrow(
      'O parametro days deve estar entre 1 e 365.',
    );
  });

  it('remove uma entrada de peso e retorna o resumo do dia atualizado', async () => {
    syncService.removeLegacyWeight.mockResolvedValue(true);

    const result = await service.removeWeight('user-1', 'w-1');

    expect(syncService.removeLegacyWeight).toHaveBeenCalledWith('user-1', 'w-1');
    expect(result).not.toBeNull();
  });

  it('retorna null quando a entrada de peso nao existe ou nao pertence ao usuario', async () => {
    syncService.removeLegacyWeight.mockResolvedValue(false);

    await expect(service.removeWeight('user-1', 'w-404')).resolves.toBeNull();
  });
});
