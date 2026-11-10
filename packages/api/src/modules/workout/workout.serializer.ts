import { localizeWorkoutPlan } from './workout.localization';

/**
 * Serializers puros de Treino (DB row -> shape app). Sem dependencia de Nest/Prisma.
 * Campos Json voltam como arrays/objetos do app.
 */

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

interface WorkoutProfileRow {
  experience: string;
  daysPerWeek: number;
  daysOfWeekJson?: unknown;
  healthConditionsJson: unknown;
  equipment: string;
  location?: string;
  splitPreference?: string;
  goal?: string;
  availableEquipmentJson?: unknown;
  minutesPerSession: number;
}

export function serializeWorkoutProfile(profile: WorkoutProfileRow) {
  return {
    experience: profile.experience,
    daysPerWeek: profile.daysPerWeek,
    daysOfWeek: asArray<number>(profile.daysOfWeekJson),
    healthConditions: asArray<string>(profile.healthConditionsJson),
    equipment: profile.equipment,
    location: profile.location ?? 'GYM',
    splitPreference: profile.splitPreference ?? 'AUTO',
    goal: profile.goal ?? 'GENERAL_FITNESS',
    availableEquipment: asArray<string>(profile.availableEquipmentJson),
    minutesPerSession: profile.minutesPerSession,
  };
}

interface WorkoutPlanRow {
  id: string;
  version: number;
  rulesVersion: string;
  name: string;
  generatedAt: Date | string;
  workoutProfileSnapshotJson: unknown;
  daysJson: unknown;
}

export function serializeWorkoutPlan(plan: WorkoutPlanRow, locale?: string) {
  const serialized = {
    id: plan.id,
    version: plan.version,
    rulesVersion: plan.rulesVersion,
    name: plan.name,
    days: asArray(plan.daysJson),
    generatedAt: plan.generatedAt,
    workoutProfileSnapshot: plan.workoutProfileSnapshotJson,
  };
  return locale ? localizeWorkoutPlan(serialized, locale) : serialized;
}

interface WorkoutSessionRow {
  id: string;
  planId: string;
  workoutId: string;
  startedAt: Date | string;
  finishedAt?: Date | string | null;
  durationMin?: number | null;
  completedExercisesJson: unknown;
}

export function serializeWorkoutSession(session: WorkoutSessionRow) {
  return {
    id: session.id,
    planId: session.planId,
    workoutId: session.workoutId,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt ?? undefined,
    completedExercises: asArray<string>(session.completedExercisesJson),
    durationMin: session.durationMin ?? undefined,
  };
}
