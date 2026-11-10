/**
 * Serializer puro de Streak (DB row -> shape app).
 *
 * Contrato D1: o banco mantem a forma canonica (currentStreak/longestStreak +
 * metadados). A adaptacao para o shape do app ({ current, longest }) acontece SO
 * na borda. Funcao pura, sem dependencia de Nest/Prisma — espelha meal.serializer.ts.
 */

/** Row "duck-typed" de Streak. Campos internos extras sao aceitos e ignorados. */
interface StreakRow {
  currentStreak: number;
  longestStreak: number;
  // Campos internos aceitos mas nunca expostos no output:
  id?: string;
  userId?: string;
  lastActiveDate?: Date | string;
  updatedAt?: Date | string;
}

/** Streak DB row -> shape app: apenas { current, longest }. Sem campos internos. */
export function serializeStreak(streak: StreakRow): { current: number; longest: number } {
  return {
    current: streak.currentStreak,
    longest: streak.longestStreak,
  };
}
