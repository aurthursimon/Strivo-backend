const DAY_MS = 24 * 60 * 60 * 1000;
export const GLP1_SCHEDULE_HORIZON_DAYS = 366;
const MAX_GENERATED_DOSES = 1000;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function localParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: validTimeZone(timeZone),
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')) % 24,
    minute: Number(values.get('minute')),
  };
}

function localDateTimeToUtc(parts: LocalDateTimeParts, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let guess = target;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = localParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const correction = target - actualAsUtc;
    if (correction === 0) break;
    guess += correction;
  }

  return new Date(guess);
}

function addLocalDays(parts: LocalDateTimeParts, days: number): LocalDateTimeParts {
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: calendar.getUTCFullYear(),
    month: calendar.getUTCMonth() + 1,
    day: calendar.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  };
}

export function localTimeInZone(date: Date, timeZone: string): string {
  const parts = localParts(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function weekdayInZone(date: Date, timeZone: string): number {
  const parts = localParts(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function buildFutureDoseSchedule({
  anchorAt,
  intervalHours,
  usualLocalTime,
  timeZone,
  now = new Date(),
}: {
  anchorAt: Date;
  intervalHours: number;
  usualLocalTime?: string;
  timeZone: string;
  now?: Date;
}): Date[] {
  if (!Number.isFinite(intervalHours) || intervalHours < 1) return [];

  const horizonBase = new Date(Math.max(anchorAt.getTime(), now.getTime()));
  const horizonEnd = new Date(horizonBase.getTime() + GLP1_SCHEDULE_HORIZON_DAYS * DAY_MS);
  const result: Date[] = [];

  if (Number.isInteger(intervalHours / 24)) {
    const intervalDays = intervalHours / 24;
    const anchorParts = localParts(anchorAt, timeZone);
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
      usualLocalTime ?? localTimeInZone(anchorAt, timeZone),
    );
    if (!timeMatch) return [];
    anchorParts.hour = Number(timeMatch[1]);
    anchorParts.minute = Number(timeMatch[2]);

    let index = 1;
    while (result.length < MAX_GENERATED_DOSES) {
      const candidate = localDateTimeToUtc(
        addLocalDays(anchorParts, intervalDays * index),
        timeZone,
      );
      index += 1;
      if (candidate.getTime() <= now.getTime()) continue;
      if (candidate.getTime() > horizonEnd.getTime()) break;
      result.push(candidate);
    }
    return result;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  let candidate = new Date(anchorAt.getTime() + intervalMs);
  while (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + intervalMs);
  }
  while (candidate.getTime() <= horizonEnd.getTime() && result.length < MAX_GENERATED_DOSES) {
    result.push(candidate);
    candidate = new Date(candidate.getTime() + intervalMs);
  }
  return result;
}
