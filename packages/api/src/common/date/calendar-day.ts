function validTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Returns the user's calendar day as the canonical midnight-UTC anchor used by
 * Prisma `@db.Date` columns. The instant is not midnight in the user's zone;
 * only the YYYY-MM-DD calendar fields are significant.
 */
export function calendarDayInTimeZone(
  date = new Date(),
  timeZone: string | null | undefined = 'UTC',
): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: validTimeZone(timeZone),
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get('year'));
  const month = Number(values.get('month'));
  const day = Number(values.get('day'));

  return new Date(Date.UTC(year, month - 1, day));
}
