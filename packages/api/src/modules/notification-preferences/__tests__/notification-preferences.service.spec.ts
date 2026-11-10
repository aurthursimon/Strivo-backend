import { NotificationPreferencesService } from '../notification-preferences.service';

describe('NotificationPreferencesService', () => {
  const storedPreference = {
    id: 'pref-1',
    breakfast: true,
    breakfastTime: '07:30',
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
    progressCheck: false,
    progressCheckTime: '09:00',
    progressCheckWeekday: 1,
    streakRisk: true,
    streakRiskTime: '21:00',
    pushEnabled: true,
    syncSequence: null,
    syncOccurredAt: null,
    updatedAt: new Date('2026-08-25T12:00:00.000Z'),
  };

  it('inherits the onboarding opt-in when creating preferences for an existing user', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      user: {
        findUnique: jest.fn().mockResolvedValue({ notificationsOptIn: true }),
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(storedPreference),
      },
      syncChange: { create: jest.fn().mockResolvedValue({ revision: 2n }) },
    };
    const prisma = {
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new NotificationPreferencesService(prisma as never);

    await service.getPreferences('user-1');

    expect(tx.notificationPreference.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', pushEnabled: true },
    });
    expect(tx.syncChange.create).toHaveBeenCalled();
  });

  it('persists the schedule and keeps the user opt-in flag synchronized', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      notificationPreference: {
        upsert: jest.fn().mockResolvedValue(storedPreference),
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      syncChange: { create: jest.fn().mockResolvedValue({ revision: 2n }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new NotificationPreferencesService(prisma as never);

    const result = await service.updatePreferences('user-1', {
      pushEnabled: true,
      workout: true,
      workoutTime: '18:00',
      workoutDays: [1, 3, 5],
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        pushEnabled: true,
        workout: true,
        workoutTime: '18:00',
        workoutDaysJson: [1, 3, 5],
        syncOccurredAt: null,
        syncMutationId: null,
        syncInstallationId: null,
        syncSequence: null,
      },
      update: {
        pushEnabled: true,
        workout: true,
        workoutTime: '18:00',
        workoutDaysJson: [1, 3, 5],
        syncOccurredAt: null,
        syncMutationId: null,
        syncInstallationId: null,
        syncSequence: null,
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { notificationsOptIn: true },
    });
    expect(tx.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        entityType: 'NOTIFICATION_PREFERENCES',
        entityId: 'pref-1',
        action: 'UPSERT',
      }),
    });
    expect(result.workoutDays).toEqual([1, 3, 5]);
  });

  it('serializes push registration with sync writes and clears the logical watermark', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      notificationPreference: {
        upsert: jest.fn().mockResolvedValue(storedPreference),
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      syncChange: { create: jest.fn().mockResolvedValue({ revision: 2n }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new NotificationPreferencesService(prisma as never);
    const subscription = { endpoint: 'https://push.example.test/subscription' };

    await service.registerPushSubscription('user-1', subscription);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', pushEnabled: true, pushSubscription: subscription },
      update: {
        pushEnabled: true,
        pushSubscription: subscription,
        syncOccurredAt: null,
        syncMutationId: null,
        syncInstallationId: null,
        syncSequence: null,
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { notificationsOptIn: true },
    });
  });
});
