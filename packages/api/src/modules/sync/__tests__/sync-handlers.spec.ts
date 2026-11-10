import { WaterAddSyncHandler, WeightLogSyncHandler } from '../handlers';
import { SyncOperationRejectedError } from '../sync.types';

const baseMutation = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  sequence: 1,
  entityId: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-08-25T12:00:00.000Z',
};

describe('handlers de sync', () => {
  const tx = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    goal: { findFirst: jest.fn() },
    dailyLog: { upsert: jest.fn(), update: jest.fn(), count: jest.fn() },
    waterEntry: { findUnique: jest.fn(), create: jest.fn() },
    weightEntry: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    achievementDefinition: { findUnique: jest.fn() },
    userAchievement: { upsert: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    tx.user.findUnique.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
    tx.user.update.mockResolvedValue({});
    tx.goal.findFirst.mockResolvedValue(null);
    tx.dailyLog.upsert.mockResolvedValue({ id: 'log-1' });
    tx.dailyLog.update.mockResolvedValue({});
    tx.dailyLog.count.mockResolvedValue(0);
    tx.achievementDefinition.findUnique.mockResolvedValue(null);
    tx.waterEntry.findUnique.mockResolvedValue(null);
    tx.weightEntry.findUnique.mockResolvedValue(null);
  });

  it('registra agua no dia civil do usuario e preserva occurredAt', async () => {
    tx.waterEntry.create.mockResolvedValue({
      id: baseMutation.entityId,
      amountMl: 350,
      loggedAt: new Date(baseMutation.occurredAt),
    });
    const handler = new WaterAddSyncHandler();

    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      occurredAt: new Date(baseMutation.occurredAt),
      mutation: { ...baseMutation, type: 'WATER_ADD', payload: { amountMl: 350 } },
    });

    expect(tx.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_date: { userId: 'user-1', date: new Date('2026-08-25T00:00:00.000Z') },
        },
      }),
    );
    expect(tx.waterEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: baseMutation.entityId,
        clientMutationId: baseMutation.mutationId,
        loggedAt: new Date(baseMutation.occurredAt),
      }),
    });
    expect(result.data).toEqual(expect.objectContaining({ amountMl: 350, day: '2026-08-25' }));
  });

  it('rejeita campos desconhecidos antes de escrever', async () => {
    const handler = new WaterAddSyncHandler();

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        occurredAt: new Date(baseMutation.occurredAt),
        mutation: {
          ...baseMutation,
          type: 'WATER_ADD',
          payload: { amountMl: 350, admin: true },
        },
      }),
    ).rejects.toBeInstanceOf(SyncOperationRejectedError);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('repara replay legado existente sem somar agua novamente', async () => {
    tx.waterEntry.findUnique.mockResolvedValueOnce({
      id: 'legacy-water',
      amountMl: 350,
      loggedAt: new Date(baseMutation.occurredAt),
      dailyLog: { date: new Date('2026-08-25T00:00:00.000Z') },
    });
    const handler = new WaterAddSyncHandler();

    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      occurredAt: new Date(baseMutation.occurredAt),
      mutation: { ...baseMutation, type: 'WATER_ADD', payload: { amountMl: 350 } },
    });

    expect(result.entityId).toBe('legacy-water');
    expect(tx.waterEntry.create).not.toHaveBeenCalled();
    expect(tx.dailyLog.update).not.toHaveBeenCalled();
  });

  it('migra ID legado nao UUID sem duplicar uma entrada ja aceita', async () => {
    tx.waterEntry.findUnique.mockResolvedValueOnce({
      id: 'legacy-water',
      amountMl: 350,
      loggedAt: new Date(baseMutation.occurredAt),
      dailyLog: { date: new Date('2026-08-25T00:00:00.000Z') },
    });
    const handler = new WaterAddSyncHandler();

    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      occurredAt: new Date(baseMutation.occurredAt),
      mutation: {
        ...baseMutation,
        type: 'WATER_ADD',
        payload: {
          amountMl: 350,
          legacyClientMutationId: 'water-1787678400000-a1b2c3',
        },
      },
    });

    expect(tx.waterEntry.findUnique).toHaveBeenCalledWith({
      where: {
        userId_clientMutationId: {
          userId: 'user-1',
          clientMutationId: 'water-1787678400000-a1b2c3',
        },
      },
      include: { dailyLog: { select: { date: true } } },
    });
    expect(result.entityId).toBe('legacy-water');
    expect(tx.waterEntry.create).not.toHaveBeenCalled();
    expect(tx.dailyLog.update).not.toHaveBeenCalled();
  });

  it('preserva o UUID novo como clientMutationId ao migrar uma entrada inedita', async () => {
    tx.waterEntry.create.mockResolvedValue({
      id: baseMutation.entityId,
      amountMl: 350,
      loggedAt: new Date(baseMutation.occurredAt),
    });
    const handler = new WaterAddSyncHandler();

    await handler.execute(tx as never, {
      userId: 'user-1',
      occurredAt: new Date(baseMutation.occurredAt),
      mutation: {
        ...baseMutation,
        type: 'WATER_ADD',
        payload: {
          amountMl: 350,
          legacyClientMutationId: 'water-1787678400000-a1b2c3',
        },
      },
    });

    expect(tx.waterEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientMutationId: baseMutation.mutationId }),
    });
  });

  it('rejeita legacyClientMutationId fora do formato seguro', async () => {
    const handler = new WaterAddSyncHandler();

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        occurredAt: new Date(baseMutation.occurredAt),
        mutation: {
          ...baseMutation,
          type: 'WATER_ADD',
          payload: { amountMl: 350, legacyClientMutationId: 'water id com espacos' },
        },
      }),
    ).rejects.toMatchObject({ code: 'SYNC_LEGACY_MUTATION_ID_INVALID' });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejeita occurredAt muito futuro ou anterior a janela historica', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const handler = new WaterAddSyncHandler();

    try {
      await expect(
        handler.execute(tx as never, {
          userId: 'user-1',
          occurredAt: new Date('2026-08-25T12:06:00.000Z'),
          mutation: {
            ...baseMutation,
            occurredAt: '2026-08-25T12:06:00.000Z',
            type: 'WATER_ADD',
            payload: { amountMl: 350 },
          },
        }),
      ).rejects.toMatchObject({ code: 'SYNC_OCCURRED_AT_IN_FUTURE' });

      await expect(
        handler.execute(tx as never, {
          userId: 'user-1',
          occurredAt: new Date('2025-08-24T11:59:59.000Z'),
          mutation: {
            ...baseMutation,
            occurredAt: '2025-08-24T11:59:59.000Z',
            type: 'WATER_ADD',
            payload: { amountMl: 350 },
          },
        }),
      ).rejects.toMatchObject({ code: 'SYNC_OCCURRED_AT_TOO_OLD' });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('mantem o peso atual mais recente ao receber um evento antigo', async () => {
    const oldDate = new Date('2026-08-20T12:00:00.000Z');
    tx.weightEntry.create.mockResolvedValue({
      id: baseMutation.entityId,
      weightKg: 82,
      measuredAt: oldDate,
    });
    tx.weightEntry.findFirst
      .mockResolvedValueOnce({ weightKg: 82 })
      .mockResolvedValueOnce({ weightKg: 79 });
    tx.dailyLog.count.mockResolvedValueOnce(3);
    tx.achievementDefinition.findUnique.mockResolvedValueOnce({ id: 'achievement-weight-3' });
    const handler = new WeightLogSyncHandler();

    await handler.execute(tx as never, {
      userId: 'user-1',
      occurredAt: oldDate,
      mutation: { ...baseMutation, type: 'WEIGHT_LOG', payload: { weightKg: 82 } },
    });

    expect(tx.dailyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { weightKg: 82 },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { weightKg: 79 },
    });
    expect(tx.userAchievement.upsert).toHaveBeenCalledWith({
      where: {
        userId_achievementId: {
          userId: 'user-1',
          achievementId: 'achievement-weight-3',
        },
      },
      create: { userId: 'user-1', achievementId: 'achievement-weight-3' },
      update: {},
    });
  });
});
