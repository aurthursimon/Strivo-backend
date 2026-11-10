/**
 * Regras de pontuacao autoritativas do servidor.
 *
 * O cliente envia `points` no evento, mas isso e meramente consultivo: o backend
 * recalcula a pontuacao pelo tipo do evento (ver app-backend-map.md). Pontos sao
 * concedidos por comportamento, nunca por restricao calorica ou perda de peso.
 */
export const POINTS_BY_EVENT_TYPE: Record<string, number> = {
  MEAL_LOGGED: 10,
  WATER_GOAL_MET: 25,
  WORKOUT_COMPLETED: 40,
  STREAK_DAY: 20,
  PLAN_GENERATED: 0,
  BADGE_UNLOCKED: 0,
};

export const POINTS_PER_LEVEL = 500;

/** Pontos autoritativos para um tipo de evento; tipos desconhecidos valem 0. */
export function pointsForEventType(type: string): number {
  return POINTS_BY_EVENT_TYPE[type] ?? 0;
}

/** Nivel 1-based: 0..499 -> 1, 500..999 -> 2, ... */
export function levelForPoints(points: number): number {
  return Math.floor(points / POINTS_PER_LEVEL) + 1;
}

/** XP restante para o proximo nivel. */
export function xpToNextLevel(points: number): number {
  return POINTS_PER_LEVEL - (points % POINTS_PER_LEVEL);
}
