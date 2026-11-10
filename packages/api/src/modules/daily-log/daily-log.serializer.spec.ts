import { serializeDailyLog } from './daily-log.serializer';

describe('serializeDailyLog', () => {
  const baseLog = {
    id: 'log-1',
    date: new Date('2026-06-02T00:00:00Z'),
    totalCalories: 1200,
    totalProteinG: 80,
    totalCarbsG: 150,
    totalFatG: 40,
    totalFiberG: 18,
    totalWaterMl: 1500,
    targetCalories: 2000,
    targetProteinG: 120,
    targetCarbsG: 200,
    targetFatG: 60,
    weightKg: 72.5,
  };

  const activeGoal = {
    dailyCalories: 2200,
    dailyProteinG: 130,
    dailyCarbsG: 220,
    dailyFatG: 70,
    dailyFiberG: 30,
    waterMl: 3000,
  };

  it('uses active goal values for goals and log totals for consumed (happy path)', () => {
    const result = serializeDailyLog(baseLog, activeGoal, 3);

    expect(result).toEqual({
      date: '2026-06-02',
      calories: { consumed: 1200, goal: 2200 },
      protein: { consumed: 80, goal: 130 },
      carbs: { consumed: 150, goal: 220 },
      fat: { consumed: 40, goal: 70 },
      fiber: { consumed: 18, goal: 30 },
      water: { consumed: 1500, goal: 3000 },
      weight: 72.5,
      mealsCount: 3,
    });
  });

  it('falls back to log.target* and water.goal=0 when no active goal', () => {
    const result = serializeDailyLog(baseLog, null, 0);

    expect(result.calories.goal).toBe(2000);
    expect(result.protein.goal).toBe(120);
    expect(result.carbs.goal).toBe(200);
    expect(result.fat.goal).toBe(60);
    expect(result.water.goal).toBe(0);
    expect(result.mealsCount).toBe(0);
  });

  it('falls back to 0 for everything when no goal and no targets', () => {
    const log = {
      ...baseLog,
      targetCalories: null,
      targetProteinG: null,
      targetCarbsG: null,
      targetFatG: null,
    };
    const result = serializeDailyLog(log, null, 0);

    expect(result.calories.goal).toBe(0);
    expect(result.protein.goal).toBe(0);
    expect(result.carbs.goal).toBe(0);
    expect(result.fat.goal).toBe(0);
    expect(result.water.goal).toBe(0);
  });

  it('water.goal=0 when goal present but waterMl null', () => {
    const goal = { ...activeGoal, waterMl: null };
    const result = serializeDailyLog(baseLog, goal, 1);

    expect(result.water.goal).toBe(0);
  });

  it('falls back to log.target* when a macro goal is null on the active goal', () => {
    const goal = { ...activeGoal, dailyProteinG: null };
    const result = serializeDailyLog(baseLog, goal, 1);

    expect(result.protein.goal).toBe(120); // from log.targetProteinG
    expect(result.calories.goal).toBe(2200); // still from goal
  });

  it('serializes weight as null when log.weightKg is null', () => {
    const log = { ...baseLog, weightKg: null };
    const result = serializeDailyLog(log, activeGoal, 1);

    expect(result.weight).toBeNull();
  });

  it('serializes weight as null when log.weightKg is undefined', () => {
    const log = { ...baseLog };
    delete (log as { weightKg?: number | null }).weightKg;
    const result = serializeDailyLog(log, activeGoal, 1);

    expect(result.weight).toBeNull();
  });

  it('formats a Date instance to YYYY-MM-DD', () => {
    const result = serializeDailyLog(baseLog, activeGoal, 1);
    expect(result.date).toBe('2026-06-02');
  });

  it('formats a string date by slicing first 10 chars', () => {
    const log = { ...baseLog, date: '2026-06-02T00:00:00.000Z' };
    const result = serializeDailyLog(log, activeGoal, 1);
    expect(result.date).toBe('2026-06-02');
  });

  it('passes mealsCount through verbatim', () => {
    expect(serializeDailyLog(baseLog, activeGoal, 7).mealsCount).toBe(7);
    expect(serializeDailyLog(baseLog, activeGoal, 0).mealsCount).toBe(0);
  });
});
