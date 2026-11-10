/**
 * Serializer puro de DailyLog (DB row -> shape app "today").
 *
 * Converte a linha canonica do banco (macros com sufixo G, snapshot de targets,
 * date como @db.Date midnight UTC) para o shape esperado pelo app mobile (spec
 * 2.6): estrutura aninhada { consumed, goal } por macro, water.goal vindo da
 * Goal ativa, weight no topo e mealsCount.
 *
 * Funcao pura, sem dependencia de Nest/Prisma — espelha meal.serializer.ts.
 * NAO importar de common/ (o barrel transitivamente toca config, que faz
 * process.exit sem env). Tudo local ao modulo.
 */

/** Row "duck-typed" de DailyLog. Campos internos extras sao aceitos e ignorados. */
interface DailyLogRow {
  id: string;
  date: Date | string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG?: number;
  totalWaterMl: number;
  targetCalories?: number | null;
  targetProteinG?: number | null;
  targetCarbsG?: number | null;
  targetFatG?: number | null;
  weightKg?: number | null;
  // Campos internos aceitos mas nunca expostos no output:
  userId?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/** Row "duck-typed" da Goal ativa. Pode ser null. */
interface GoalRow {
  dailyCalories: number;
  dailyProteinG?: number | null;
  dailyCarbsG?: number | null;
  dailyFatG?: number | null;
  dailyFiberG?: number | null;
  waterMl?: number | null;
}

/** @db.Date e armazenado meia-noite UTC, entao toISOString().slice e correto. */
function formatDate(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/** goal ativa primeiro; senao snapshot do log; senao 0. */
function resolveGoal(
  goalValue: number | null | undefined,
  logTarget: number | null | undefined,
): number {
  return goalValue ?? logTarget ?? 0;
}

/** DailyLog DB row -> shape app "today". Sem campos internos. */
export function serializeDailyLog(log: DailyLogRow, goal: GoalRow | null, mealsCount: number) {
  return {
    date: formatDate(log.date),
    calories: {
      consumed: log.totalCalories,
      goal: resolveGoal(goal ? goal.dailyCalories : null, log.targetCalories),
    },
    protein: {
      consumed: log.totalProteinG,
      goal: resolveGoal(goal ? goal.dailyProteinG : null, log.targetProteinG),
    },
    carbs: {
      consumed: log.totalCarbsG,
      goal: resolveGoal(goal ? goal.dailyCarbsG : null, log.targetCarbsG),
    },
    fat: {
      consumed: log.totalFatG,
      goal: resolveGoal(goal ? goal.dailyFatG : null, log.targetFatG),
    },
    fiber: {
      consumed: log.totalFiberG ?? 0,
      goal: resolveGoal(goal ? goal.dailyFiberG : null, null),
    },
    water: {
      consumed: log.totalWaterMl,
      // Water nao tem fallback no log: so a goal ativa, senao 0.
      goal: goal?.waterMl ?? 0,
    },
    weight: log.weightKg ?? null,
    mealsCount,
  };
}
