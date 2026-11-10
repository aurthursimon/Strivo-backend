import { serializeMeal, serializeMealItem } from '../meal.serializer';

describe('meal.serializer', () => {
  describe('serializeMealItem (DB row -> shape app)', () => {
    it('mapeia campos *G para nomes do app e preserva id/name/calories', () => {
      const result = serializeMealItem({
        id: 'item-1',
        name: 'Arroz',
        calories: 156,
        proteinG: 3,
        carbsG: 34,
        fatG: 0.4,
        fiberG: 1.6,
        portionG: 100,
        portionLabel: 'serving',
        // campos internos que NAO devem vazar
        mealId: 'meal-1',
        foodItemId: 'food-9',
        quantity: 1,
      });

      expect(result).toEqual({
        id: 'item-1',
        name: 'Arroz',
        calories: 156,
        protein: 3,
        carbs: 34,
        fat: 0.4,
        fiber: 1.6,
        portion: 100,
        unit: 'serving',
      });
    });

    it('null-safe: portionLabel null -> unit null', () => {
      const result = serializeMealItem({
        id: 'item-2',
        name: 'Frango',
        calories: 200,
        proteinG: 30,
        carbsG: 0,
        fatG: 8,
        portionG: 120,
        portionLabel: null,
      });

      expect(result.unit).toBeNull();
    });

    it('nao expoe campos internos (mealId/foodItemId/quantity)', () => {
      const keys = Object.keys(
        serializeMealItem({
          id: 'item-3',
          name: 'Ovo',
          calories: 70,
          proteinG: 6,
          carbsG: 0.5,
          fatG: 5,
          portionG: 50,
          portionLabel: 'unit',
          mealId: 'meal-1',
          foodItemId: 'food-2',
          quantity: 2,
        }),
      );

      expect(keys).not.toContain('mealId');
      expect(keys).not.toContain('foodItemId');
      expect(keys).not.toContain('quantity');
      expect(keys).not.toContain('proteinG');
      expect(keys).not.toContain('portionG');
    });
  });

  describe('serializeMeal (DB row -> shape app)', () => {
    const loggedAt = new Date('2026-06-01T12:00:00Z');

    const baseMeal = {
      id: 'meal-1',
      type: 'LUNCH',
      idempotencyKey: 'diet:plan-1:2026-08-13:LUNCH:recipe-1',
      imageUrl: 'http://img/1.jpg',
      imageHash: 'hash-1',
      confidence: 0.91,
      wasEdited: false,
      totalCalories: 426,
      totalProteinG: 39,
      totalCarbsG: 34,
      totalFatG: 13.4,
      totalFiberG: 5.2,
      loggedAt,
      items: [
        {
          id: 'item-1',
          name: 'Arroz',
          calories: 156,
          proteinG: 3,
          carbsG: 34,
          fatG: 0.4,
          fiberG: 1.6,
          portionG: 100,
          portionLabel: 'serving',
        },
      ],
      // campos internos que NAO devem vazar
      userId: 'user-1',
      dailyLogId: 'log-1',
      updatedAt: new Date('2026-06-02T00:00:00Z'),
      aiRaw: { foo: 'bar' },
    };

    it('mapeia totais *G -> totalProtein/Carbs/Fat e expoe createdAt = loggedAt', () => {
      const result = serializeMeal(baseMeal);

      expect(result.totalCalories).toBe(426);
      expect(result.totalProtein).toBe(39);
      expect(result.totalCarbs).toBe(34);
      expect(result.totalFat).toBe(13.4);
      expect(result.totalFiber).toBe(5.2);
      expect(result.createdAt).toBe(loggedAt);
      expect(result.type).toBe('LUNCH');
      expect(result.sourceKey).toBe('diet:plan-1:2026-08-13:LUNCH:recipe-1');
      expect(result.imageUrl).toBe('http://img/1.jpg');
      expect(result.imageHash).toBe('hash-1');
      expect(result.confidence).toBe(0.91);
      expect(result.wasEdited).toBe(false);
    });

    it('serializa items via serializeMealItem', () => {
      const result = serializeMeal(baseMeal);

      expect(result.items).toEqual([
        {
          id: 'item-1',
          name: 'Arroz',
          calories: 156,
          protein: 3,
          carbs: 34,
          fat: 0.4,
          fiber: 1.6,
          portion: 100,
          unit: 'serving',
        },
      ]);
    });

    it('items vazio -> items: []', () => {
      const result = serializeMeal({ ...baseMeal, items: [] });
      expect(result.items).toEqual([]);
    });

    it('nao vaza campos internos (userId/dailyLogId/updatedAt/loggedAt/aiRaw)', () => {
      const keys = Object.keys(serializeMeal(baseMeal));

      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('dailyLogId');
      expect(keys).not.toContain('updatedAt');
      expect(keys).not.toContain('loggedAt');
      expect(keys).not.toContain('aiRaw');
      expect(keys).not.toContain('totalProteinG');
    });
  });
});
