import { serializeStreak } from '../streaks.serializer';

describe('streaks.serializer', () => {
  it('mapeia currentStreak/longestStreak -> current/longest', () => {
    const result = serializeStreak({
      currentStreak: 5,
      longestStreak: 12,
      // campos internos que NAO devem vazar
      id: 'streak-1',
      userId: 'user-1',
      lastActiveDate: new Date('2026-06-07T00:00:00Z'),
      updatedAt: new Date('2026-06-07T10:00:00Z'),
    });
    expect(result).toEqual({ current: 5, longest: 12 });
  });

  it('output keys === exatamente { current, longest }', () => {
    const keys = Object.keys(
      serializeStreak({
        currentStreak: 3,
        longestStreak: 8,
        id: 'streak-2',
        userId: 'user-2',
        lastActiveDate: new Date(),
        updatedAt: new Date(),
      }),
    ).sort();
    expect(keys).toEqual(['current', 'longest']);
  });

  it('zeros -> { current: 0, longest: 0 }', () => {
    expect(serializeStreak({ currentStreak: 0, longestStreak: 0 })).toEqual({
      current: 0,
      longest: 0,
    });
  });
});
