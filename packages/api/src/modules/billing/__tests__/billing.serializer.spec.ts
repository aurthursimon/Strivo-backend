import { mapPlanToShort } from '../billing.serializer';

describe('billing.serializer', () => {
  describe('mapPlanToShort', () => {
    it('PREMIUM_MONTHLY -> MONTHLY', () => {
      expect(mapPlanToShort('PREMIUM_MONTHLY')).toBe('MONTHLY');
    });

    it('PREMIUM_YEARLY -> YEARLY', () => {
      expect(mapPlanToShort('PREMIUM_YEARLY')).toBe('YEARLY');
    });

    it('null -> null', () => {
      expect(mapPlanToShort(null)).toBeNull();
    });
  });
});
