import { serializePreferences, mapPreferencesInput } from '../notification-preferences.serializer';

describe('notification-preferences.serializer', () => {
  const baseRow = {
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
    workout: false,
    workoutTime: '18:00',
    workoutDaysJson: [1, 3, 5],
    progressCheck: false,
    progressCheckTime: '09:00',
    progressCheckWeekday: 1,
    streakRisk: true,
    streakRiskTime: '21:00',
    pushEnabled: false,
    // campos internos que NAO devem vazar
    id: 'pref-1',
    userId: 'user-1',
    pushSubscription: { endpoint: 'x' },
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
  };

  describe('serializePreferences (DB row -> shape app)', () => {
    it('refeicao ativa -> "HH:mm"', () => {
      const result = serializePreferences(baseRow);
      expect(result.breakfast).toBe('07:30');
      expect(result.lunch).toBe('12:00');
      expect(result.dinner).toBe('19:00');
    });

    it('refeicao desativada -> null (mesmo com hora presente)', () => {
      const result = serializePreferences({
        ...baseRow,
        breakfast: false,
        breakfastTime: '07:30',
      });
      expect(result.breakfast).toBeNull();
    });

    it('afternoonSnack desativado por padrao -> null', () => {
      const result = serializePreferences(baseRow);
      expect(result.afternoonSnack).toBeNull();
    });

    it('output keys === whitelist do app (sem *Time/id/userId/pushSubscription)', () => {
      const keys = Object.keys(serializePreferences(baseRow)).sort();
      expect(keys).toEqual(
        [
          'pushEnabled',
          'breakfast',
          'lunch',
          'afternoonSnack',
          'dinner',
          'water',
          'waterIntervalH',
          'waterStartTime',
          'waterEndTime',
          'workout',
          'workoutTime',
          'workoutDays',
          'progressCheck',
          'progressCheckTime',
          'progressCheckWeekday',
          'streakRisk',
          'streakRiskTime',
        ].sort(),
      );
      expect(keys).not.toContain('breakfastTime');
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('pushSubscription');
    });

    it('water/streakRisk/pushEnabled booleans + waterIntervalH int passados sem alteracao', () => {
      const result = serializePreferences({
        ...baseRow,
        water: false,
        streakRisk: false,
        pushEnabled: true,
        waterIntervalH: 4,
      });
      expect(result.water).toBe(false);
      expect(result.streakRisk).toBe(false);
      expect(result.pushEnabled).toBe(true);
      expect(result.waterIntervalH).toBe(4);
      expect(result.workoutDays).toEqual([1, 3, 5]);
    });
  });

  describe('mapPreferencesInput (app PATCH -> Prisma update data)', () => {
    it('refeicao string -> { [meal]: true, [meal]Time: value }', () => {
      const result = mapPreferencesInput({ breakfast: '08:00' });
      expect(result).toEqual({ breakfast: true, breakfastTime: '08:00' });
    });

    it('refeicao null -> { [meal]: false } (NAO seta *Time)', () => {
      const result = mapPreferencesInput({ breakfast: null });
      expect(result).toEqual({ breakfast: false });
      expect(result).not.toHaveProperty('breakfastTime');
    });

    it('refeicao undefined -> chave ausente (intocado)', () => {
      const result = mapPreferencesInput({});
      expect(result).not.toHaveProperty('breakfast');
      expect(result).not.toHaveProperty('breakfastTime');
    });

    it('water/waterIntervalH/streakRisk/pushEnabled passados sem alteracao', () => {
      const result = mapPreferencesInput({
        water: false,
        waterIntervalH: 3,
        waterStartTime: '09:00',
        waterEndTime: '20:00',
        workout: true,
        workoutTime: '17:30',
        workoutDays: [1, 4, 6],
        progressCheck: true,
        progressCheckTime: '10:00',
        progressCheckWeekday: 0,
        streakRisk: true,
        streakRiskTime: '20:30',
        pushEnabled: false,
      });
      expect(result).toEqual({
        water: false,
        waterIntervalH: 3,
        waterStartTime: '09:00',
        waterEndTime: '20:00',
        workout: true,
        workoutTime: '17:30',
        workoutDaysJson: [1, 4, 6],
        progressCheck: true,
        progressCheckTime: '10:00',
        progressCheckWeekday: 0,
        streakRisk: true,
        streakRiskTime: '20:30',
        pushEnabled: false,
      });
    });

    it('input vazio {} -> {} (nenhuma chave)', () => {
      expect(mapPreferencesInput({})).toEqual({});
    });

    it('mistura: varias refeicoes + flags juntas', () => {
      const result = mapPreferencesInput({
        lunch: '13:00',
        dinner: null,
        pushEnabled: true,
      });
      expect(result).toEqual({
        lunch: true,
        lunchTime: '13:00',
        dinner: false,
        pushEnabled: true,
      });
    });
  });
});
