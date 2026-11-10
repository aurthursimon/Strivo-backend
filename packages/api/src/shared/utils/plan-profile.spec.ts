import { normalizeDietType, toUserDietType } from './plan-profile';

describe('plan profile diet type', () => {
  it.each(['carnivore', 'carnívora', 'CARNIVORE'])('%s is preserved as CARNIVORE', (value) => {
    const normalized = normalizeDietType(value);

    expect(normalized).toBe('CARNIVORE');
    expect(toUserDietType(normalized)).toBe('CARNIVORE');
  });
});
