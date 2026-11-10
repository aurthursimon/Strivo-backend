import {
  calculateBmr,
  calculateTdee,
  calculateMacros,
  calculateFiberG,
  calculateWaterMl,
  calculateAll,
  calculateAge,
} from '../../../shared';

describe('NutritionCalc', () => {
  describe('calculateBmr', () => {
    it('should calculate BMR for male', () => {
      const bmr = calculateBmr({ gender: 'MALE', weightKg: 72.5, heightCm: 175, ageYears: 26 });
      expect(bmr).toBe(1694);
    });

    it('should calculate BMR for female', () => {
      const bmr = calculateBmr({ gender: 'FEMALE', weightKg: 60, heightCm: 165, ageYears: 28 });
      expect(bmr).toBe(1330);
    });

    it('uses a neutral midpoint when sex is other or undisclosed', () => {
      const input = { weightKg: 70, heightCm: 170, ageYears: 30 };
      const other = calculateBmr({ ...input, gender: 'OTHER' });
      const undisclosed = calculateBmr({ ...input, gender: 'PREFER_NOT_TO_SAY' });
      const male = calculateBmr({ ...input, gender: 'MALE' });
      const female = calculateBmr({ ...input, gender: 'FEMALE' });

      expect(other).toBe(undisclosed);
      expect(other).toBe(Math.round((male + female) / 2));
    });
  });

  describe('calculateTdee', () => {
    it('should apply activity multiplier', () => {
      const input = { gender: 'MALE' as const, weightKg: 72.5, heightCm: 175, ageYears: 26 };
      const bmr = calculateBmr(input);
      const tdee = calculateTdee({ ...input, activityLevel: 'MODERATE' as const });
      expect(tdee).toBe(Math.round(bmr * 1.55));
    });

    it('should return higher TDEE for VERY_ACTIVE', () => {
      const input = { gender: 'MALE' as const, weightKg: 72.5, heightCm: 175, ageYears: 26 };
      const moderate = calculateTdee({ ...input, activityLevel: 'MODERATE' as const });
      const veryActive = calculateTdee({ ...input, activityLevel: 'VERY_ACTIVE' as const });
      expect(veryActive).toBeGreaterThan(moderate);
    });
  });

  describe('calculateMacros', () => {
    it('sets fiber at 14 g per 1,000 kcal', () => {
      expect(calculateFiberG(1840)).toBe(26);
      expect(calculateFiberG(2000)).toBe(28);
      expect(calculateFiberG(2000, 'carnívora')).toBe(0);
    });

    it('should create deficit for LOSE_WEIGHT', () => {
      const result = calculateMacros({ tdee: 2600, goalType: 'LOSE_WEIGHT', weightKg: 72.5 });
      expect(result.dailyCalories).toBeLessThan(2600);
    });

    it('should keep TDEE for MAINTAIN', () => {
      const result = calculateMacros({ tdee: 2600, goalType: 'MAINTAIN', weightKg: 72.5 });
      expect(result.dailyCalories).toBe(2600);
    });

    it('should create surplus for GAIN_WEIGHT', () => {
      const result = calculateMacros({ tdee: 2600, goalType: 'GAIN_WEIGHT', weightKg: 72.5 });
      expect(result.dailyCalories).toBeGreaterThan(2600);
    });

    it('should create surplus for GAIN_MUSCLE', () => {
      const result = calculateMacros({ tdee: 2600, goalType: 'GAIN_MUSCLE', weightKg: 72.5 });
      expect(result.dailyCalories).toBeGreaterThan(2600);
    });

    it('limits an aggressive deficit and respects the personalized calorie floor', () => {
      const result = calculateMacros({
        tdee: 1300,
        goalType: 'LOSE_WEIGHT',
        weightKg: 50,
        gender: 'FEMALE',
        ageYears: 30,
        weeklyGoalKg: 2,
      });
      expect(result.dailyCalories).toBeGreaterThanOrEqual(1200);
    });

    it('personalizes protein by activity and objective instead of using a fixed 2g/kg', () => {
      const base = { tdee: 2600, weightKg: 75, heightCm: 175, ageYears: 35 };
      const sedentary = calculateMacros({
        ...base,
        goalType: 'MAINTAIN',
        activityLevel: 'SEDENTARY',
      });
      const activeMuscleGain = calculateMacros({
        ...base,
        goalType: 'GAIN_MUSCLE',
        activityLevel: 'ACTIVE',
      });

      expect(sedentary.proteinG).toBe(90);
      expect(activeMuscleGain.proteinG).toBeGreaterThan(sedentary.proteinG);
      expect(activeMuscleGain.proteinG).toBeLessThanOrEqual(150);
    });

    it('keeps ordinary adult targets within the disclosed 1.2-1.6 g/kg range', () => {
      const base = { tdee: 2400, weightKg: 75, heightCm: 175, ageYears: 35 };
      const sedentary = calculateMacros({
        ...base,
        goalType: 'LOSE_WEIGHT',
        activityLevel: 'SEDENTARY',
      });
      const veryActive = calculateMacros({
        ...base,
        goalType: 'LOSE_WEIGHT',
        activityLevel: 'VERY_ACTIVE',
      });

      expect(sedentary.proteinG).toBe(90);
      expect(veryActive.proteinG).toBe(120);
    });

    it('rejects calorie targets for minors', () => {
      expect(() =>
        calculateMacros({
          tdee: 2200,
          goalType: 'LOSE_WEIGHT',
          weightKg: 70,
          gender: 'MALE',
          ageYears: 17,
        }),
      ).toThrow('available only for adults');
    });

    it('keeps standard macros aligned with the calorie target', () => {
      const result = calculateMacros({
        tdee: 2400,
        goalType: 'LOSE_WEIGHT',
        weightKg: 80,
        heightCm: 175,
        ageYears: 40,
        gender: 'MALE',
        activityLevel: 'MODERATE',
        dietType: 'OMNIVORE',
      });
      const macroCalories = result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9;

      expect(Math.abs(macroCalories - result.dailyCalories)).toBeLessThanOrEqual(6);
      expect((result.fatG * 9) / result.dailyCalories).toBeGreaterThanOrEqual(0.2);
      expect((result.fatG * 9) / result.dailyCalories).toBeLessThanOrEqual(0.35);
    });

    it('adapts carbs, fat and fiber to keto and carnivore profiles', () => {
      const base = {
        tdee: 2200,
        goalType: 'MAINTAIN' as const,
        weightKg: 80,
        heightCm: 180,
        ageYears: 35,
        activityLevel: 'MODERATE' as const,
      };
      const keto = calculateMacros({ ...base, dietType: 'KETO' });
      const carnivore = calculateMacros({ ...base, dietType: 'CARNIVORE' });

      expect(keto.carbsG).toBeLessThanOrEqual(50);
      expect(keto.fiberG).toBeLessThanOrEqual(25);
      expect(carnivore.carbsG).toBe(20);
      expect(carnivore.fiberG).toBe(0);
      expect(carnivore.fatG).toBeGreaterThan(keto.fatG - 10);
    });
  });

  describe('calculateWaterMl', () => {
    it('uses sex, body size and activity for the beverage target', () => {
      const base = { weightKg: 80, heightCm: 180, ageYears: 30 };
      const sedentary = calculateWaterMl({
        ...base,
        gender: 'MALE',
        activityLevel: 'SEDENTARY',
      });
      const moderate = calculateWaterMl({
        ...base,
        gender: 'MALE',
        activityLevel: 'MODERATE',
      });

      expect(sedentary).toBe(3000);
      expect(moderate).toBe(3300);
    });

    it('caps the body-size component for high BMI and the final target at 5 L', () => {
      const result = calculateWaterMl({
        gender: 'MALE',
        weightKg: 500,
        heightCm: 150,
        ageYears: 35,
        activityLevel: 'VERY_ACTIVE',
      });

      expect(result).toBeLessThanOrEqual(5000);
      expect(result).toBe(3750);
    });
  });

  describe('calculateAll', () => {
    it('should return bmr, tdee, and macros', () => {
      const result = calculateAll({
        gender: 'MALE',
        weightKg: 72.5,
        heightCm: 175,
        ageYears: 26,
        activityLevel: 'MODERATE',
        goalType: 'LOSE_WEIGHT',
        weeklyGoalKg: 0.5,
      });

      expect(result).toHaveProperty('bmr');
      expect(result).toHaveProperty('tdee');
      expect(result).toHaveProperty('waterMl');
      expect(result).toHaveProperty('macros');
      expect(result.macros).toHaveProperty('dailyCalories');
      expect(result.macros).toHaveProperty('proteinG');
      expect(result.macros).toHaveProperty('carbsG');
      expect(result.macros).toHaveProperty('fatG');
      expect(result.macros).toHaveProperty('fiberG');
      expect(result.macros.dailyCalories).toBeLessThan(result.tdee);
    });
  });

  describe('calculateAge', () => {
    it('should calculate age correctly', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 26);
      const age = calculateAge(birthDate);
      expect(age).toBe(26);
    });
  });
});
