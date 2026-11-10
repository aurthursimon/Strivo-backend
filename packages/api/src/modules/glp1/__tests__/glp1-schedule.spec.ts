import {
  GLP1_SCHEDULE_HORIZON_DAYS,
  buildFutureDoseSchedule,
  localTimeInZone,
} from '../glp1-schedule';

describe('GLP-1 future schedule', () => {
  it('generates at least one year of weekly future doses', () => {
    const anchorAt = new Date('2026-08-10T11:00:00.000Z');
    const schedule = buildFutureDoseSchedule({
      anchorAt,
      intervalHours: 168,
      usualLocalTime: '08:00',
      timeZone: 'America/Sao_Paulo',
      now: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(schedule).toHaveLength(53);
    expect(schedule[0]).toEqual(new Date('2026-08-17T11:00:00.000Z'));
    expect(schedule.at(-1)!.getTime()).toBeGreaterThan(
      new Date('2026-08-15T12:00:00.000Z').getTime() +
        (GLP1_SCHEDULE_HORIZON_DAYS - 8) * 24 * 60 * 60 * 1000,
    );
  });

  it('keeps the selected local hour when daylight saving changes', () => {
    const schedule = buildFutureDoseSchedule({
      anchorAt: new Date('2026-10-25T12:00:00.000Z'),
      intervalHours: 168,
      usualLocalTime: '08:00',
      timeZone: 'America/New_York',
      now: new Date('2026-10-25T12:00:00.000Z'),
    });

    expect(localTimeInZone(schedule[0]!, 'America/New_York')).toBe('08:00');
    expect(localTimeInZone(schedule[2]!, 'America/New_York')).toBe('08:00');
  });

  it('starts after now when the reference dose is old', () => {
    const schedule = buildFutureDoseSchedule({
      anchorAt: new Date('2025-01-01T11:00:00.000Z'),
      intervalHours: 24,
      usualLocalTime: '08:00',
      timeZone: 'America/Sao_Paulo',
      now: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(schedule[0]!.getTime()).toBeGreaterThan(new Date('2026-08-15T12:00:00.000Z').getTime());
    expect(schedule.length).toBeGreaterThanOrEqual(365);
  });

  it.each([1, 7, 14, 30, 90, 365])(
    'covers the full horizon for an interval of %i days without duplicate dates',
    (intervalDays) => {
      const now = new Date('2026-08-15T12:00:00.000Z');
      const schedule = buildFutureDoseSchedule({
        anchorAt: new Date('2026-08-10T11:00:00.000Z'),
        intervalHours: intervalDays * 24,
        usualLocalTime: '08:00',
        timeZone: 'America/Sao_Paulo',
        now,
      });

      expect(schedule.length).toBeGreaterThan(0);
      expect(new Set(schedule.map((date) => date.toISOString())).size).toBe(schedule.length);
      expect(schedule.every((date) => date.getTime() > now.getTime())).toBe(true);
      expect(schedule.every((date) => localTimeInZone(date, 'America/Sao_Paulo') === '08:00')).toBe(
        true,
      );
      for (let index = 1; index < schedule.length; index += 1) {
        expect(schedule[index]!.getTime()).toBeGreaterThan(schedule[index - 1]!.getTime());
      }
      const horizonEnd = now.getTime() + GLP1_SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000;
      expect(horizonEnd - schedule.at(-1)!.getTime()).toBeLessThan(
        intervalDays * 24 * 60 * 60 * 1000,
      );
    },
  );

  it('falls back safely to UTC when a persisted timezone is invalid', () => {
    const schedule = buildFutureDoseSchedule({
      anchorAt: new Date('2026-08-15T08:00:00.000Z'),
      intervalHours: 24,
      usualLocalTime: '08:00',
      timeZone: 'Invalid/Timezone',
      now: new Date('2026-08-15T09:00:00.000Z'),
    });

    expect(schedule[0]).toEqual(new Date('2026-08-16T08:00:00.000Z'));
  });
});
