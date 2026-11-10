export const TRAINING_CHALLENGES = [
  { id: 'first-session', metric: 'workouts', target: 1 },
  { id: 'weekly-three', metric: 'workouts', target: 3 },
  { id: 'active-hour', metric: 'minutes', target: 60 },
  { id: 'twenty-sets', metric: 'sets', target: 20 },
] as const;

// One shared UTC Monday boundary for every participant and device.
export function trainingWeek(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}
