import { ConflictException } from '@nestjs/common';
import { Prisma, SyncMutationStatus } from '@prisma/client';
import type { SyncMutationDto } from '../dto';
import { SYNC_RESULT_STATUSES } from '../sync.constants';
import { hashSyncMutation } from '../sync-hash';
import { SyncService } from '../sync.service';
import { SyncOperationConflictError } from '../sync.types';

const mutation: SyncMutationDto = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  sequence: 1,
  type: 'WATER_ADD',
  entityId: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-08-25T12:00:00.000Z',
  payload: { amountMl: 350 },
};
const installationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('SyncService', () => {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    syncMutation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    syncChange: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    syncState: {
      findUnique: jest.fn(),
    },
    syncBootstrapSession: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    waterEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    weightEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    meal: {
      findMany: jest.fn(),
    },
    workoutSession: {
      findMany: jest.fn(),
    },
    glp1DoseEvent: {
      findMany: jest.fn(),
    },
    glp1SymptomEvent: {
      findMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
    },
    dailyLog: {
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };
  const handler = {
    execute: jest.fn(),
  };
  const registry = {
    resolve: jest.fn(),
  };
  let service: SyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.syncMutation.findUnique.mockResolvedValue(null);
    prisma.syncMutation.findMany.mockResolvedValue([]);
    prisma.syncMutation.create.mockResolvedValue({});
    prisma.syncMutation.update.mockResolvedValue({});
    prisma.syncChange.create.mockResolvedValue({ revision: 7n });
    prisma.syncState.findUnique.mockResolvedValue({
      id: 1,
      currentRevision: 1n,
      retentionFloor: 1n,
    });
    prisma.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    prisma.syncBootstrapSession.deleteMany.mockResolvedValue({ count: 0 });
    prisma.waterEntry.findMany.mockResolvedValue([]);
    prisma.waterEntry.delete.mockResolvedValue({});
    prisma.waterEntry.aggregate.mockResolvedValue({ _sum: { amountMl: 500 } });
    prisma.dailyLog.update.mockResolvedValue({});
    prisma.weightEntry.findMany.mockResolvedValue([]);
    prisma.meal.findMany.mockResolvedValue([]);
    prisma.workoutSession.findMany.mockResolvedValue([]);
    prisma.glp1DoseEvent.findMany.mockResolvedValue([]);
    prisma.glp1SymptomEvent.findMany.mockResolvedValue([]);
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    handler.execute.mockResolvedValue({
      entityType: 'WATER_ENTRY',
      entityId: mutation.entityId,
      action: 'UPSERT',
      data: { amountMl: 350 },
    });
    registry.resolve.mockReturnValue(handler);
    service = new SyncService(prisma as never, registry as never);
  });

  it('aplica cada mutacao em transacao, grava ledger e publica journal', async () => {
    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results).toEqual([
      expect.objectContaining({
        mutationId: mutation.mutationId,
        status: SYNC_RESULT_STATUSES.APPLIED,
        revision: '7',
      }),
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.syncMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        mutationId: mutation.mutationId,
        installationId,
        requestHash: hashSyncMutation(mutation),
      }),
    });
    expect(prisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        mutationId: mutation.mutationId,
        entityType: 'WATER_ENTRY',
      }),
    });
    expect(prisma.syncMutation.update).toHaveBeenCalledWith({
      where: { userId_mutationId: { userId: 'user-1', mutationId: mutation.mutationId } },
      data: expect.objectContaining({ status: SyncMutationStatus.APPLIED }),
    });
  });

  it('reconhece replay identico sem executar o handler outra vez', async () => {
    prisma.syncMutation.findUnique.mockResolvedValue({
      requestHash: hashSyncMutation(mutation),
      status: SyncMutationStatus.APPLIED,
      resultJson: {
        revision: '7',
        result: { entityType: 'WATER_ENTRY' },
      },
    });

    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({ status: SYNC_RESULT_STATUSES.DUPLICATE, revision: '7' }),
    );
    expect(handler.execute).not.toHaveBeenCalled();
    expect(prisma.syncChange.create).not.toHaveBeenCalled();
  });

  it('recusa reutilizar mutationId com outro conteudo', async () => {
    prisma.syncMutation.findUnique.mockResolvedValue({
      requestHash: 'outro-hash',
      status: SyncMutationStatus.APPLIED,
      resultJson: null,
    });

    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({
        status: SYNC_RESULT_STATUSES.CONFLICT,
        error: expect.objectContaining({ code: 'SYNC_MUTATION_ID_REUSED' }),
      }),
    );
    expect(handler.execute).not.toHaveBeenCalled();
  });

  it('persiste conflitos de dominio como resultado terminal e nao retry generico', async () => {
    handler.execute.mockRejectedValueOnce(
      new SyncOperationConflictError('POSSIBLE_DUPLICATE', 'Possivel dose duplicada.'),
    );

    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({
        status: SYNC_RESULT_STATUSES.CONFLICT,
        error: expect.objectContaining({ code: 'POSSIBLE_DUPLICATE', retryable: false }),
      }),
    );
    expect(prisma.syncMutation.update).toHaveBeenCalledWith({
      where: { userId_mutationId: { userId: 'user-1', mutationId: mutation.mutationId } },
      data: expect.objectContaining({
        status: SyncMutationStatus.REJECTED,
        errorCode: 'POSSIBLE_DUPLICATE',
      }),
    });
  });

  it('reproduz o mesmo CONFLICT terminal em replay identico', async () => {
    prisma.syncMutation.findUnique.mockResolvedValue({
      requestHash: hashSyncMutation(mutation),
      status: SyncMutationStatus.REJECTED,
      resultJson: {
        mutationId: mutation.mutationId,
        entityId: mutation.entityId,
        status: SYNC_RESULT_STATUSES.CONFLICT,
        error: {
          code: 'POSSIBLE_DUPLICATE',
          message: 'Possivel dose duplicada.',
          retryable: false,
        },
      },
    });

    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({
        status: SYNC_RESULT_STATUSES.CONFLICT,
        error: expect.objectContaining({ code: 'POSSIBLE_DUPLICATE' }),
      }),
    );
    expect(handler.execute).not.toHaveBeenCalled();
  });

  it('recusa reutilizar a mesma sequencia na mesma instalacao', async () => {
    prisma.syncMutation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ mutationId: '33333333-3333-4333-8333-333333333333' });

    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({
        status: SYNC_RESULT_STATUSES.CONFLICT,
        error: expect.objectContaining({ code: 'SYNC_SEQUENCE_REUSED' }),
      }),
    );
    expect(handler.execute).not.toHaveBeenCalled();
  });

  it('converge para DUPLICATE quando outra transacao vence a corrida do ledger', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    prisma.$transaction.mockRejectedValueOnce(uniqueError);
    prisma.syncMutation.findUnique.mockResolvedValueOnce({
      requestHash: hashSyncMutation(mutation),
      status: SyncMutationStatus.APPLIED,
      resultJson: { revision: '9', entityId: mutation.entityId },
    });

    const response = await service.push('user-1', { installationId, mutations: [mutation] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({ status: SYNC_RESULT_STATUSES.DUPLICATE, revision: '9' }),
    );
  });

  it('registra operacao ainda nao allowlisted como rejeitada', async () => {
    registry.resolve.mockReturnValue(undefined);
    const unsupported = { ...mutation, type: 'UNSUPPORTED_TEST_OPERATION' };

    const response = await service.push('user-1', { installationId, mutations: [unsupported] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({
        status: SYNC_RESULT_STATUSES.REJECTED,
        error: expect.objectContaining({ code: 'SYNC_OPERATION_NOT_ENABLED' }),
      }),
    );
    expect(prisma.syncMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: SyncMutationStatus.REJECTED }),
    });
  });

  it('aguarda dependencias sem criar ledger parcial', async () => {
    const pending = {
      ...mutation,
      dependsOn: ['33333333-3333-4333-8333-333333333333'],
    };

    const response = await service.push('user-1', { installationId, mutations: [pending] });

    expect(response.results[0]).toEqual(
      expect.objectContaining({ status: SYNC_RESULT_STATUSES.DEPENDENCY_PENDING }),
    );
    expect(prisma.syncMutation.create).not.toHaveBeenCalled();
  });

  it('persiste rejeicao quando uma dependencia foi rejeitada', async () => {
    const rejectedDependencyId = '33333333-3333-4333-8333-333333333333';
    prisma.syncMutation.findMany.mockResolvedValue([
      { mutationId: rejectedDependencyId, status: SyncMutationStatus.REJECTED },
    ]);
    const dependent = {
      ...mutation,
      dependsOn: [rejectedDependencyId],
    };

    const response = await service.push('user-1', {
      installationId,
      mutations: [dependent],
    });

    expect(response.results[0]).toEqual(
      expect.objectContaining({
        status: SYNC_RESULT_STATUSES.REJECTED,
        error: expect.objectContaining({ code: 'SYNC_DEPENDENCY_REJECTED' }),
      }),
    );
    expect(prisma.syncMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        mutationId: mutation.mutationId,
        status: SyncMutationStatus.REJECTED,
        errorCode: 'SYNC_DEPENDENCY_REJECTED',
      }),
    });
  });

  it('pagina alteracoes usando um watermark capturado antes da leitura', async () => {
    prisma.syncState.findUnique.mockResolvedValue({
      id: 1,
      currentRevision: 10n,
      retentionFloor: 1n,
    });
    prisma.syncChange.findMany.mockResolvedValue([
      {
        revision: 8n,
        entityType: 'WATER_ENTRY',
        entityId: mutation.entityId,
        action: 'UPSERT',
        version: null,
        mutationId: mutation.mutationId,
        occurredAt: new Date(mutation.occurredAt),
        dataJson: { amountMl: 350 },
      },
    ]);

    const response = await service.getChanges('user-1', { afterRevision: '7', limit: 100 });

    expect(response.nextRevision).toBe('10');
    expect(response.hasMore).toBe(false);
    expect(response.changes[0]).toEqual(expect.objectContaining({ revision: '8' }));
    expect(prisma.syncChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: { gt: 7n, lte: 10n } }),
      }),
    );
  });

  it('nao recua o watermark quando o dono das maiores revisoes e excluido em cascade', async () => {
    prisma.syncState.findUnique.mockResolvedValue({
      id: 1,
      currentRevision: 99n,
      retentionFloor: 1n,
    });
    prisma.syncChange.findMany.mockResolvedValue([]);

    const response = await service.getChanges('remaining-user', {
      afterRevision: '95',
      limit: 100,
    });

    expect(response.changes).toEqual([]);
    expect(response.nextRevision).toBe('99');
    expect(prisma.syncChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'remaining-user',
          revision: { gt: 95n, lte: 99n },
        }),
      }),
    );
  });

  it('exige novo bootstrap quando o cursor ficou abaixo do floor persistido', async () => {
    prisma.syncState.findUnique.mockResolvedValue({
      id: 1,
      currentRevision: 120n,
      retentionFloor: 80n,
    });

    await expect(
      service.getChanges('user-1', { afterRevision: '79', limit: 100 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BOOTSTRAP_REQUIRED' }),
    });
    expect(prisma.syncChange.findMany).not.toHaveBeenCalled();
  });

  it('exige bootstrap para o cursor inicial', async () => {
    await expect(service.getChanges('user-1', { afterRevision: '0' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.syncChange.findMany).not.toHaveBeenCalled();
  });

  it('materializa um bootstrap consistente e pagina a mesma sessao', async () => {
    prisma.syncState.findUnique.mockResolvedValue({
      id: 1,
      currentRevision: 15n,
      retentionFloor: 1n,
    });
    prisma.waterEntry.findMany.mockResolvedValue([
      {
        id: 'water-1',
        amountMl: 350,
        loggedAt: new Date('2026-08-24T12:00:00.000Z'),
        dailyLog: { date: new Date('2026-08-24T00:00:00.000Z') },
      },
    ]);
    prisma.weightEntry.findMany.mockResolvedValue([
      {
        id: 'weight-1',
        weightKg: 79,
        measuredAt: new Date('2026-08-25T12:00:00.000Z'),
        dailyLog: { date: new Date('2026-08-25T00:00:00.000Z') },
      },
    ]);
    let storedSession: Record<string, unknown> | undefined;
    prisma.syncBootstrapSession.create.mockImplementation(async ({ data }) => {
      storedSession = { ...data, createdAt: new Date() };
      return storedSession;
    });

    const first = await service.getBootstrap('user-1', { limit: 1 });
    prisma.syncBootstrapSession.findFirst.mockResolvedValue(storedSession);
    const second = await service.getBootstrap('user-1', {
      limit: 1,
      cursor: first.nextPageCursor ?? undefined,
    });

    expect(first).toEqual(
      expect.objectContaining({
        snapshotRevision: '15',
        cursor: null,
        hasMore: true,
        totalItems: 2,
        items: [expect.objectContaining({ entityType: 'WATER_ENTRY' })],
      }),
    );
    expect(second).toEqual(
      expect.objectContaining({
        snapshotRevision: '15',
        cursor: '15',
        hasMore: false,
        nextPageCursor: null,
        items: [expect.objectContaining({ entityType: 'WEIGHT_ENTRY' })],
      }),
    );
    expect(prisma.syncBootstrapSession.create).toHaveBeenCalledTimes(1);
  });

  it('inclui as entidades offline expandidas no snapshot canonico', async () => {
    const at = new Date('2026-08-25T12:00:00.000Z');
    prisma.syncState.findUnique.mockResolvedValue({
      id: 1,
      currentRevision: 20n,
      retentionFloor: 1n,
    });
    prisma.meal.findMany.mockResolvedValue([
      {
        id: 'meal-1',
        type: 'LUNCH',
        items: [],
        totalCalories: 100,
        totalProteinG: 10,
        totalCarbsG: 10,
        totalFatG: 2,
        totalFiberG: 1,
        imageHash: null,
        confidence: null,
        wasEdited: false,
        loggedAt: at,
        dailyLog: { date: new Date('2026-08-25T00:00:00.000Z') },
      },
    ]);
    prisma.workoutSession.findMany.mockResolvedValue([
      {
        id: 'workout-1',
        planId: 'plan-1',
        workoutId: 'day-1',
        startedAt: at,
        finishedAt: null,
        durationMin: null,
        completedExercisesJson: [],
      },
    ]);
    prisma.glp1DoseEvent.findMany.mockResolvedValue([
      {
        id: 'dose-1',
        treatmentId: 'treatment-1',
        scheduledAt: null,
        reminderAt: null,
        takenAt: at,
        doseMg: { toNumber: () => 0.5 },
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
        injectionSiteCode: null,
        painLevel: null,
        notes: null,
        source: 'USER',
        possibleDuplicateOfId: null,
        duplicateConfirmedAt: null,
        version: 1,
        createdAt: at,
        updatedAt: at,
      },
    ]);
    prisma.glp1SymptomEvent.findMany.mockResolvedValue([
      {
        id: 'symptom-1',
        treatmentId: 'treatment-1',
        code: 'nausea',
        customName: null,
        severity: 3,
        occurredAt: at,
        endedAt: null,
        durationMinutes: null,
        notes: null,
        relatedDoseEventIdsJson: [],
        acknowledgedAt: null,
        safetyContentVersion: null,
        version: 1,
        createdAt: at,
        updatedAt: at,
      },
    ]);
    prisma.notificationPreference.findUnique.mockResolvedValue({
      id: 'pref-1',
      pushEnabled: true,
      breakfast: true,
      breakfastTime: '07:00',
      lunch: true,
      lunchTime: '12:00',
      afternoonSnack: false,
      afternoonSnackTime: '15:00',
      dinner: true,
      dinnerTime: '19:00',
      water: true,
      waterIntervalH: 2,
      waterStartTime: '08:00',
      waterEndTime: '22:00',
      workout: true,
      workoutTime: '18:00',
      workoutDaysJson: [1, 3, 5],
      progressCheck: true,
      progressCheckTime: '09:00',
      progressCheckWeekday: 1,
      streakRisk: true,
      streakRiskTime: '21:00',
      syncSequence: 9,
      syncOccurredAt: at,
      updatedAt: at,
    });
    prisma.syncBootstrapSession.create.mockImplementation(async ({ data }) => data);

    const snapshot = await service.getBootstrap('user-1', { limit: 20 });

    expect(snapshot.totalItems).toBe(5);
    expect(snapshot.items.map((item) => item.entityType).sort()).toEqual([
      'GLP1_DOSE_EVENT',
      'GLP1_SYMPTOM_EVENT',
      'MEAL',
      'NOTIFICATION_PREFERENCES',
      'WORKOUT_SESSION',
    ]);
    expect(snapshot.items.find((item) => item.entityType === 'MEAL')?.data).toEqual(
      expect.objectContaining({ loggedAt: at.toISOString(), day: '2026-08-25' }),
    );
  });

  it('publica tombstone e recalcula agregado na exclusao legada de agua', async () => {
    prisma.waterEntry.findFirst.mockResolvedValue({
      id: 'water-1',
      dailyLogId: 'log-1',
    });

    await expect(service.removeLegacyWater('user-1', 'water-1')).resolves.toBe(true);

    expect(prisma.waterEntry.delete).toHaveBeenCalledWith({ where: { id: 'water-1' } });
    expect(prisma.dailyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { totalWaterMl: 500 },
    });
    expect(prisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        entityType: 'WATER_ENTRY',
        entityId: 'water-1',
        action: 'DELETE',
      }),
    });
  });

  it('publica tombstone e recalcula o peso mais recente do dia e do usuario na exclusao', async () => {
    prisma.weightEntry.findFirst.mockResolvedValueOnce({ id: 'weight-1', dailyLogId: 'log-1' });
    prisma.weightEntry.delete.mockResolvedValue({});
    prisma.weightEntry.findFirst
      .mockResolvedValueOnce({ weightKg: 79.5 }) // latest remaining for the day
      .mockResolvedValueOnce({ weightKg: 78.1 }); // latest remaining for the user overall

    await expect(service.removeLegacyWeight('user-1', 'weight-1')).resolves.toBe(true);

    expect(prisma.weightEntry.delete).toHaveBeenCalledWith({ where: { id: 'weight-1' } });
    expect(prisma.dailyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { weightKg: 79.5 },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { weightKg: 78.1 },
    });
    expect(prisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        entityType: 'WEIGHT_ENTRY',
        entityId: 'weight-1',
        action: 'DELETE',
      }),
    });
  });

  it('zera o peso do dia e do usuario quando a entrada excluida era a unica', async () => {
    prisma.weightEntry.findFirst.mockResolvedValueOnce({ id: 'weight-1', dailyLogId: 'log-1' });
    prisma.weightEntry.delete.mockResolvedValue({});
    prisma.weightEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(service.removeLegacyWeight('user-1', 'weight-1')).resolves.toBe(true);

    expect(prisma.dailyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { weightKg: null },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { weightKg: null },
    });
  });

  it('retorna false ao tentar excluir uma entrada de peso que nao existe ou nao pertence ao usuario', async () => {
    prisma.weightEntry.findFirst.mockResolvedValueOnce(null);

    await expect(service.removeLegacyWeight('user-1', 'weight-404')).resolves.toBe(false);

    expect(prisma.weightEntry.delete).not.toHaveBeenCalled();
    expect(prisma.syncChange.create).not.toHaveBeenCalled();
  });
});
