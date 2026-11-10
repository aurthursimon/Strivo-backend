import {
  toGoalType,
  fromGoalType,
  toUpperEnum,
  fromLowerEnum,
  serializeUser,
  serializeGoal,
} from '../enum-maps';

describe('enum-maps', () => {
  describe('toGoalType (app -> interno)', () => {
    it('mapeia LOSE -> LOSE_WEIGHT', () => {
      expect(toGoalType('LOSE')).toBe('LOSE_WEIGHT');
      expect(toGoalType('lose')).toBe('LOSE_WEIGHT');
    });

    it('mapeia GAIN -> GAIN_WEIGHT', () => {
      expect(toGoalType('GAIN')).toBe('GAIN_WEIGHT');
      expect(toGoalType('gain')).toBe('GAIN_WEIGHT');
    });

    it('mapeia MAINTAIN -> MAINTAIN', () => {
      expect(toGoalType('MAINTAIN')).toBe('MAINTAIN');
    });
  });

  describe('fromGoalType (interno -> app)', () => {
    it('mapeia LOSE_WEIGHT -> LOSE', () => {
      expect(fromGoalType('LOSE_WEIGHT')).toBe('LOSE');
    });

    it('mapeia GAIN_WEIGHT -> GAIN', () => {
      expect(fromGoalType('GAIN_WEIGHT')).toBe('GAIN');
    });

    it('mapeia GAIN_MUSCLE -> GAIN', () => {
      expect(fromGoalType('GAIN_MUSCLE')).toBe('GAIN');
    });

    it('mapeia MAINTAIN -> MAINTAIN', () => {
      expect(fromGoalType('MAINTAIN')).toBe('MAINTAIN');
    });
  });

  describe('toUpperEnum / fromLowerEnum', () => {
    it('toUpperEnum normaliza lowercase para UPPER', () => {
      expect(toUpperEnum('moderate')).toBe('MODERATE');
    });

    it('fromLowerEnum normaliza UPPER para lowercase', () => {
      expect(fromLowerEnum('MODERATE')).toBe('moderate');
    });

    it('toUpperEnum preserva undefined/null', () => {
      expect(toUpperEnum(undefined)).toBeUndefined();
      expect(toUpperEnum(null)).toBeNull();
    });

    it('fromLowerEnum preserva undefined/null', () => {
      expect(fromLowerEnum(undefined)).toBeUndefined();
      expect(fromLowerEnum(null)).toBeNull();
    });
  });

  describe('serializeUser', () => {
    it('converte enums para lowercase e preserva flags/campos', () => {
      const result = serializeUser({
        id: 'u1',
        email: 'a@b.com',
        name: 'Matheus',
        locale: 'pt',
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        measurementSystem: 'METRIC',
        regionDetectionSource: 'DEVICE_REGION',
        avatarUrl: null,
        birthDate: null,
        gender: 'MALE',
        heightCm: 175,
        weightKg: 72,
        activityLevel: 'MODERATE',
        dietType: 'OMNIVORE',
        exerciseCalories: true,
        rolloverCalories: false,
        notificationsOptIn: true,
        onboardingCompleted: true,
        healthConnectOptIn: false,
        createdAt: new Date('2026-01-01'),
      });

      expect(result.gender).toBe('male');
      expect(result.activityLevel).toBe('moderate');
      expect(result.dietType).toBe('omnivore');
      expect(result.onboardingCompleted).toBe(true);
      expect(result.exerciseCalories).toBe(true);
      expect(result.rolloverCalories).toBe(false);
      expect(result.notificationsOptIn).toBe(true);
      expect(result.id).toBe('u1');
      expect(result.email).toBe('a@b.com');
      expect(result.name).toBe('Matheus');
      expect(result.locale).toBe('pt');
      expect(result.countryCode).toBe('BR');
      expect(result.timezone).toBe('America/Sao_Paulo');
      expect(result.measurementSystem).toBe('metric');
      expect(result.regionDetectionSource).toBe('device_region');
      expect(result.heightCm).toBe(175);
    });

    it('mantem null/undefined nos enums sem quebrar', () => {
      const result = serializeUser({
        id: 'u2',
        email: 'c@d.com',
        name: null,
        gender: null,
        activityLevel: undefined,
        dietType: null,
        onboardingCompleted: false,
      });

      expect(result.gender).toBeNull();
      expect(result.activityLevel).toBeUndefined();
      expect(result.dietType).toBeNull();
      expect(result.onboardingCompleted).toBe(false);
    });

    it('substitui somente o nome legado de convidado por User mais quatro digitos', () => {
      const legacyGuest = serializeUser({
        id: 'guest-legacy',
        email: null,
        name: 'My Peptides User',
        provider: 'GUEST',
      });
      const editedGuest = serializeUser({
        id: 'guest-edited',
        email: null,
        name: 'Matheus',
        provider: 'GUEST',
      });

      expect(legacyGuest.name).toMatch(/^User\d{4}$/);
      expect(editedGuest.name).toBe('Matheus');
    });
  });

  describe('serializeGoal', () => {
    it('renomeia dailyX -> X e converte type/goalSpeed para shape app', () => {
      const createdAt = new Date('2026-01-02');
      const result = serializeGoal({
        id: 'g1',
        dailyCalories: 2100,
        dailyProteinG: 160,
        dailyCarbsG: 210,
        dailyFatG: 60,
        dailyFiberG: 29,
        waterMl: 2500,
        type: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        targetWeightKg: 72,
        calculationInputJson: { weightKg: 80 },
        createdAt,
      });

      expect(result).toEqual({
        id: 'g1',
        calories: 2100,
        protein: 160,
        carbs: 210,
        fat: 60,
        fiberG: 29,
        waterMl: 2500,
        type: 'LOSE',
        goalSpeed: 'moderate',
        targetWeightKg: 72,
        weeklyGoalKg: null,
        startWeightKg: 80,
        startDate: createdAt,
        targetDate: null,
        createdAt,
      });
    });

    it('null-safe com goalSpeed null', () => {
      const result = serializeGoal({
        id: 'g2',
        dailyCalories: 1800,
        dailyFiberG: 25,
        type: 'MAINTAIN',
        goalSpeed: null,
      });

      expect(result.goalSpeed).toBeNull();
      expect(result.type).toBe('MAINTAIN');
      expect(result.calories).toBe(1800);
      expect(result.fiberG).toBe(25);
    });
  });
});
