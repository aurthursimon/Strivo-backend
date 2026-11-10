import {
  Glp1DoseCreateSyncHandler,
  Glp1SymptomCreateSyncHandler,
  MealCreateSyncHandler,
  NotificationPreferencesSetSyncHandler,
  WorkoutSessionFinishSyncHandler,
  WorkoutSessionStartSyncHandler,
} from '../handlers';
import { applyMealCreatedEffects } from '../business-effects';
import { SyncOperationConflictError } from '../sync.types';

// These tests exercise the handlers' own domain logic, not free-tier gating,
// so stub SubscriptionAccessService as already-subscribed - that short-
// circuits before consumeFreeMealLog/consumeFreeDose ever touch `tx`.
const subscribedAccess = {
  isSubscribed: jest.fn().mockResolvedValue(true),
  consumeFreeMealLog: jest.fn().mockResolvedValue(true),
  consumeFreeDose: jest.fn().mockResolvedValue(true),
} as never;

const occurredAt = new Date('2026-08-25T12:00:00.000Z');
const installationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mutationBase = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  sequence: 10,
  entityId: '22222222-2222-4222-8222-222222222222',
  occurredAt: occurredAt.toISOString(),
};

describe('handlers offline expandidos', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:01:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cria refeicao com ID e horario do cliente no dia civil original', async () => {
    const items = [
      {
        id: 'item-db',
        mealId: mutationBase.entityId,
        name: 'Arroz',
        calories: 100,
        proteinG: 2,
        carbsG: 20,
        fatG: 1,
        fiberG: 1,
        portionG: 100,
        portionLabel: 'g',
        quantity: 2,
        foodItemId: null,
      },
    ];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
      goal: { findFirst: jest.fn().mockResolvedValue(null) },
      dailyLog: {
        upsert: jest.fn().mockResolvedValue({ id: 'log-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      streak: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ currentStreak: 1 }),
        update: jest.fn(),
      },
      achievementDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: 'achievement-first-meal' }),
      },
      userAchievement: { upsert: jest.fn() },
      foodItem: { count: jest.fn() },
      meal: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: data.id,
          userId: data.userId,
          type: data.type,
          imageHash: null,
          confidence: null,
          wasEdited: false,
          totalCalories: 200,
          totalProteinG: 4,
          totalCarbsG: 40,
          totalFatG: 2,
          totalFiberG: 2,
          loggedAt: data.loggedAt,
          items,
          dailyLog: { date: new Date('2026-08-25T00:00:00.000Z') },
        })),
      },
    };
    const handler = new MealCreateSyncHandler(subscribedAccess);
    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      installationId,
      occurredAt,
      mutation: {
        ...mutationBase,
        type: 'MEAL_CREATE',
        payload: {
          type: 'LUNCH',
          items: [
            {
              name: 'Arroz',
              calories: 100,
              protein: 2,
              carbs: 20,
              fat: 1,
              fiber: 1,
              portion: 100,
              unit: 'g',
              quantity: 2,
            },
          ],
        },
      },
    });

    expect(tx.meal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: mutationBase.entityId,
          idempotencyKey: mutationBase.mutationId,
          loggedAt: occurredAt,
          dailyLogId: 'log-1',
        }),
      }),
    );
    expect(tx.dailyLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({ totalCalories: { increment: 200 } }),
    });
    expect(tx.streak.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-25T00:00:00.000Z'),
      },
    });
    expect(tx.userAchievement.upsert).toHaveBeenCalledWith({
      where: {
        userId_achievementId: {
          userId: 'user-1',
          achievementId: 'achievement-first-meal',
        },
      },
      create: { userId: 'user-1', achievementId: 'achievement-first-meal' },
      update: {},
    });
    expect(result.data).toEqual(
      expect.objectContaining({ loggedAt: occurredAt.toISOString(), day: '2026-08-25' }),
    );
  });

  it('inicia o streak quando a consulta anterior criou o estado zerado no mesmo dia', async () => {
    const tx = {
      streak: {
        findUnique: jest.fn().mockResolvedValue({
          currentStreak: 0,
          longestStreak: 0,
          lastActiveDate: new Date('2026-08-25T00:00:00.000Z'),
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ currentStreak: 1 }),
      },
      achievementDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
      userAchievement: { upsert: jest.fn() },
    };

    await applyMealCreatedEffects(tx as never, 'user-1');

    expect(tx.streak.create).not.toHaveBeenCalled();
    expect(tx.streak.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-25T00:00:00.000Z'),
      },
    });
  });

  it('recusa reuso do entityId de refeicao quando loggedAt difere', async () => {
    const existing = {
      id: mutationBase.entityId,
      userId: 'user-1',
      idempotencyKey: mutationBase.mutationId,
      type: 'LUNCH',
      imageHash: null,
      confidence: null,
      wasEdited: false,
      totalCalories: 100,
      totalProteinG: 2,
      totalCarbsG: 20,
      totalFatG: 1,
      totalFiberG: 1,
      loggedAt: new Date('2026-08-25T11:59:00.000Z'),
      items: [
        {
          name: 'Arroz',
          calories: 100,
          proteinG: 2,
          carbsG: 20,
          fatG: 1,
          fiberG: 1,
          portionG: 100,
          portionLabel: 'g',
          quantity: 1,
          foodItemId: null,
        },
      ],
      dailyLog: { date: new Date('2026-08-25T00:00:00.000Z') },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      meal: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
      },
    };
    const handler = new MealCreateSyncHandler(subscribedAccess);

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'MEAL_CREATE',
          payload: {
            type: 'LUNCH',
            items: [
              {
                name: 'Arroz',
                calories: 100,
                protein: 2,
                carbs: 20,
                fat: 1,
                fiber: 1,
                portion: 100,
                unit: 'g',
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'SYNC_ENTITY_ID_CONFLICT' });
  });

  it('rejeita registro de refeicao quando o usuario free ja atingiu o limite gratuito', async () => {
    const freeTierExhausted = {
      isSubscribed: jest.fn().mockResolvedValue(false),
      consumeFreeMealLog: jest.fn().mockResolvedValue(false),
    } as never;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      meal: { findUnique: jest.fn().mockResolvedValue(null) },
      foodItem: { count: jest.fn() },
    };
    const handler = new MealCreateSyncHandler(freeTierExhausted);

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'MEAL_CREATE',
          payload: {
            type: 'LUNCH',
            items: [
              {
                name: 'Arroz',
                calories: 100,
                protein: 2,
                carbs: 20,
                fat: 1,
                fiber: 1,
                portion: 100,
                unit: 'g',
              },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'FREE_MEAL_LOG_LIMIT_REACHED' });
    expect(tx.foodItem.count).not.toHaveBeenCalled();
  });

  it('inicia sessao apenas para plano pertencente ao usuario e preserva o ID do cliente', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      workoutPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
      workoutSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          ...data,
          finishedAt: null,
          durationMin: null,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })),
      },
    };
    const handler = new WorkoutSessionStartSyncHandler();
    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      installationId,
      occurredAt,
      mutation: {
        ...mutationBase,
        type: 'WORKOUT_SESSION_START',
        payload: { planId: 'plan-1', workoutId: 'day-1' },
      },
    });

    expect(tx.workoutPlan.findFirst).toHaveBeenCalledWith({
      where: { id: 'plan-1', userId: 'user-1' },
      select: { id: true },
    });
    expect(tx.workoutSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: mutationBase.entityId, startedAt: occurredAt }),
    });
    expect(result.entityId).toBe(mutationBase.entityId);
  });

  it('exige dependencia START da mesma sessao antes de finalizar treino', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      syncMutation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const handler = new WorkoutSessionFinishSyncHandler();

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'WORKOUT_SESSION_FINISH',
          dependsOn: ['33333333-3333-4333-8333-333333333333'],
          payload: { completedExercises: ['squat'], durationMin: 45 },
        },
      }),
    ).rejects.toMatchObject({ code: 'SYNC_WORKOUT_START_DEPENDENCY_INVALID' });
  });

  it('finaliza uma unica vez depois da dependencia START aplicada', async () => {
    const startedAt = new Date('2026-08-25T11:00:00.000Z');
    const unfinished = {
      id: mutationBase.entityId,
      userId: 'user-1',
      planId: 'plan-1',
      workoutId: 'day-1',
      startedAt,
      finishedAt: null,
      durationMin: null,
      completedExercisesJson: [],
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    const finished = {
      ...unfinished,
      finishedAt: occurredAt,
      durationMin: 60,
      completedExercisesJson: ['squat'],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      syncMutation: { findFirst: jest.fn().mockResolvedValue({ mutationId: 'start' }) },
      workoutSession: {
        findUnique: jest.fn().mockResolvedValueOnce(unfinished).mockResolvedValueOnce(finished),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const handler = new WorkoutSessionFinishSyncHandler();
    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      installationId,
      occurredAt,
      mutation: {
        ...mutationBase,
        type: 'WORKOUT_SESSION_FINISH',
        dependsOn: ['33333333-3333-4333-8333-333333333333'],
        payload: { completedExercises: ['squat'], durationMin: 60 },
      },
    });

    expect(tx.workoutSession.updateMany).toHaveBeenCalledWith({
      where: { id: mutationBase.entityId, userId: 'user-1', finishedAt: null },
      data: expect.objectContaining({ finishedAt: occurredAt, durationMin: 60 }),
    });
    expect(result.data).toEqual(
      expect.objectContaining({ finishedAt: occurredAt.toISOString(), durationMin: 60 }),
    );
  });

  it('retorna conflito clinico explicito para possivel dose duplicada', async () => {
    const duplicate = {
      id: 'dose-existing',
      takenAt: new Date('2026-08-25T10:00:00.000Z'),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['dose'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1DoseEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(duplicate),
      },
      glp1InjectionSiteState: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const handler = new Glp1DoseCreateSyncHandler(subscribedAccess);

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'GLP1_DOSE_CREATE',
          payload: {
            treatmentId: 'treatment-1',
            doseMg: 0.5,
            status: 'TAKEN',
            route: 'SUBCUTANEOUS',
          },
        },
      }),
    ).rejects.toBeInstanceOf(SyncOperationConflictError);
  });

  it('rejeita dose acima de 2.5mg de um usuario free', async () => {
    const freeTierBlocked = {
      isSubscribed: jest.fn().mockResolvedValue(false),
      consumeFreeDose: jest.fn().mockResolvedValue(true),
    } as never;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['dose'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1DoseEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      glp1InjectionSiteState: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const handler = new Glp1DoseCreateSyncHandler(freeTierBlocked);

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'GLP1_DOSE_CREATE',
          payload: {
            treatmentId: 'treatment-1',
            doseMg: 5,
            status: 'TAKEN',
            route: 'SUBCUTANEOUS',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'FREE_DOSE_MAX_MG_EXCEEDED' });
    expect(tx.glp1DoseEvent.create).not.toHaveBeenCalled();
  });

  it('rejeita uma segunda dose de um usuario free que ja usou a dose gratuita', async () => {
    const freeTierExhausted = {
      isSubscribed: jest.fn().mockResolvedValue(false),
      consumeFreeDose: jest.fn().mockResolvedValue(false),
    } as never;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['dose'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1DoseEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      glp1InjectionSiteState: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const handler = new Glp1DoseCreateSyncHandler(freeTierExhausted);

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'GLP1_DOSE_CREATE',
          payload: {
            treatmentId: 'treatment-1',
            doseMg: 2.5,
            status: 'TAKEN',
            route: 'SUBCUTANEOUS',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'FREE_DOSE_LIMIT_REACHED' });
    expect(tx.glp1DoseEvent.create).not.toHaveBeenCalled();
  });

  it('salva dose confirmada usando occurredAt como takenAt e mutationId clinica', async () => {
    const created = {
      id: mutationBase.entityId,
      userId: 'user-1',
      treatmentId: 'treatment-1',
      scheduledAt: null,
      reminderAt: null,
      takenAt: occurredAt,
      doseMg: { toNumber: () => 0.5 },
      status: 'TAKEN',
      route: 'SUBCUTANEOUS',
      injectionSiteCode: null,
      painLevel: null,
      notes: null,
      source: 'USER',
      possibleDuplicateOfId: 'dose-existing',
      duplicateConfirmedAt: occurredAt,
      clientMutationId: mutationBase.mutationId,
      version: 1,
      deletedAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['dose'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1DoseEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'dose-existing' }),
        create: jest.fn().mockResolvedValue(created),
      },
      glp1InjectionSiteState: { findUnique: jest.fn() },
    };
    const handler = new Glp1DoseCreateSyncHandler(subscribedAccess);
    await handler.execute(tx as never, {
      userId: 'user-1',
      installationId,
      occurredAt,
      mutation: {
        ...mutationBase,
        type: 'GLP1_DOSE_CREATE',
        payload: {
          treatmentId: 'treatment-1',
          doseMg: 0.5,
          status: 'TAKEN',
          route: 'SUBCUTANEOUS',
          confirmPossibleDuplicate: true,
        },
      },
    });

    expect(tx.glp1DoseEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: mutationBase.entityId,
        takenAt: occurredAt,
        clientMutationId: mutationBase.mutationId,
        possibleDuplicateOfId: 'dose-existing',
      }),
    });
  });

  it('recusa reuso do entityId de dose quando qualquer campo persistido difere', async () => {
    const existing = {
      id: mutationBase.entityId,
      userId: 'user-1',
      treatmentId: 'treatment-1',
      scheduledAt: null,
      reminderAt: new Date('2026-08-25T11:00:00.000Z'),
      takenAt: occurredAt,
      doseMg: { toNumber: () => 0.5 },
      status: 'TAKEN',
      route: 'SUBCUTANEOUS',
      injectionSiteCode: 'abdomen-left',
      painLevel: 2,
      notes: 'conteudo anterior',
      source: 'USER',
      clientMutationId: mutationBase.mutationId,
      possibleDuplicateOfId: null,
      duplicateConfirmedAt: null,
      version: 1,
      deletedAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['dose'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1DoseEvent: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
      },
    };
    const handler = new Glp1DoseCreateSyncHandler(subscribedAccess);

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'GLP1_DOSE_CREATE',
          payload: {
            treatmentId: 'treatment-1',
            reminderAt: '2026-08-25T11:00:00.000Z',
            doseMg: 0.5,
            status: 'TAKEN',
            route: 'SUBCUTANEOUS',
            injectionSiteCode: 'abdomen-left',
            painLevel: 2,
            notes: 'conteudo novo',
            source: 'USER',
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'SYNC_ENTITY_ID_CONFLICT' });
  });

  it('mantem a barreira clinica de confirmacao para sintoma severo', async () => {
    const handler = new Glp1SymptomCreateSyncHandler();
    await expect(
      handler.execute({} as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'GLP1_SYMPTOM_CREATE',
          payload: { treatmentId: 'treatment-1', code: 'nausea', severity: 8 },
        },
      }),
    ).rejects.toMatchObject({ code: 'SAFETY_ACKNOWLEDGEMENT_REQUIRED' });
  });

  it('salva sintoma com horario original e valida ownership das doses relacionadas', async () => {
    const created = {
      id: mutationBase.entityId,
      userId: 'user-1',
      treatmentId: 'treatment-1',
      code: 'nausea',
      customName: null,
      severity: 4,
      occurredAt,
      endedAt: null,
      durationMinutes: null,
      notes: null,
      relatedDoseEventIdsJson: ['dose-1'],
      acknowledgedAt: null,
      safetyContentVersion: null,
      clientMutationId: mutationBase.mutationId,
      version: 1,
      deletedAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['symptoms'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1SymptomEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      glp1DoseEvent: { count: jest.fn().mockResolvedValue(1) },
    };
    const handler = new Glp1SymptomCreateSyncHandler();
    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      installationId,
      occurredAt,
      mutation: {
        ...mutationBase,
        type: 'GLP1_SYMPTOM_CREATE',
        payload: {
          treatmentId: 'treatment-1',
          code: 'nausea',
          severity: 4,
          relatedDoseEventIds: ['dose-1'],
        },
      },
    });

    expect(tx.glp1DoseEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'user-1', treatmentId: 'treatment-1' }),
    });
    expect(result.data).toEqual(expect.objectContaining({ occurredAt: occurredAt.toISOString() }));
  });

  it('recusa reuso do entityId de sintoma quando metadados clinicos diferem', async () => {
    const existing = {
      id: mutationBase.entityId,
      userId: 'user-1',
      treatmentId: 'treatment-1',
      code: 'nausea',
      customName: 'Nome anterior',
      severity: 4,
      occurredAt,
      endedAt: new Date('2026-08-25T13:00:00.000Z'),
      durationMinutes: 60,
      notes: 'nota',
      relatedDoseEventIdsJson: ['dose-1'],
      acknowledgedAt: null,
      safetyContentVersion: null,
      clientMutationId: mutationBase.mutationId,
      version: 1,
      deletedAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      glp1Consent: {
        findFirst: jest.fn().mockResolvedValue({ scopesJson: ['symptoms'], revokedAt: null }),
      },
      glp1Treatment: { findFirst: jest.fn().mockResolvedValue({ id: 'treatment-1' }) },
      glp1SymptomEvent: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
      },
    };
    const handler = new Glp1SymptomCreateSyncHandler();

    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'GLP1_SYMPTOM_CREATE',
          payload: {
            treatmentId: 'treatment-1',
            code: 'nausea',
            customName: 'Nome novo',
            severity: 4,
            endedAt: '2026-08-25T13:00:00.000Z',
            durationMinutes: 60,
            notes: 'nota',
            relatedDoseEventIds: ['dose-1'],
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'SYNC_ENTITY_ID_CONFLICT' });
  });

  it('recusa estado de preferencias mais antigo da mesma instalacao', async () => {
    const existing = notificationRow({
      syncOccurredAt: new Date('2026-08-25T11:00:00.000Z'),
      syncMutationId: '33333333-3333-4333-8333-333333333333',
      syncInstallationId: installationId,
      syncSequence: 11,
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(existing) },
    };
    const handler = new NotificationPreferencesSetSyncHandler();
    await expect(
      handler.execute(tx as never, {
        userId: 'user-1',
        installationId,
        occurredAt,
        mutation: {
          ...mutationBase,
          type: 'NOTIFICATION_PREFERENCES_SET',
          payload: desiredPreferences(),
        },
      }),
    ).rejects.toMatchObject({ code: 'SYNC_DESIRED_STATE_STALE' });
  });

  it('aplica estado completo de preferencias e grava a ordem logica', async () => {
    const saved = notificationRow({
      id: mutationBase.entityId,
      syncOccurredAt: occurredAt,
      syncMutationId: mutationBase.mutationId,
      syncInstallationId: installationId,
      syncSequence: mutationBase.sequence,
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(saved),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const handler = new NotificationPreferencesSetSyncHandler();
    const result = await handler.execute(tx as never, {
      userId: 'user-1',
      installationId,
      occurredAt,
      mutation: {
        ...mutationBase,
        type: 'NOTIFICATION_PREFERENCES_SET',
        payload: desiredPreferences(),
      },
    });

    expect(tx.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: expect.objectContaining({
        id: mutationBase.entityId,
        syncOccurredAt: occurredAt,
        syncSequence: mutationBase.sequence,
      }),
      update: expect.objectContaining({ syncMutationId: mutationBase.mutationId }),
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { notificationsOptIn: true },
    });
    expect(result.version).toBe(mutationBase.sequence);
  });
});

function desiredPreferences() {
  return {
    pushEnabled: true,
    breakfast: '07:00',
    lunch: '12:00',
    afternoonSnack: null,
    dinner: '19:00',
    water: true,
    waterIntervalH: 2,
    waterStartTime: '08:00',
    waterEndTime: '22:00',
    workout: true,
    workoutTime: '18:00',
    workoutDays: [1, 3, 5],
    progressCheck: true,
    progressCheckTime: '09:00',
    progressCheckWeekday: 1,
    streakRisk: true,
    streakRiskTime: '21:00',
  };
}

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pref-1',
    userId: 'user-1',
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
    pushEnabled: true,
    pushSubscription: null,
    syncOccurredAt: null,
    syncMutationId: null,
    syncInstallationId: null,
    syncSequence: null,
    createdAt: new Date('2026-08-20T12:00:00.000Z'),
    updatedAt: occurredAt,
    ...overrides,
  };
}
