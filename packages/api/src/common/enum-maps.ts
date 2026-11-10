/**
 * Mappers de enum app <-> interno e serializers de saida.
 *
 * Contrato D1: o banco mantem a forma canonica (sufixo G nas macros, enums
 * longos/UPPER). A adaptacao para o shape do app (enums lowercase, GoalType
 * curto, nomes de campo proprios) acontece SO na borda — DTOs na entrada e
 * estes serializers na saida. Funcoes puras, sem dependencia de Nest/Prisma.
 */

type GoalTypeLong = 'LOSE_WEIGHT' | 'GAIN_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE';
type GoalTypeShort = 'LOSE' | 'GAIN' | 'MAINTAIN';

const GOAL_TYPE_SHORT_TO_LONG: Record<string, GoalTypeLong> = {
  LOSE: 'LOSE_WEIGHT',
  GAIN: 'GAIN_WEIGHT',
  MAINTAIN: 'MAINTAIN',
};

const GOAL_TYPE_LONG_TO_SHORT: Record<string, GoalTypeShort> = {
  LOSE_WEIGHT: 'LOSE',
  GAIN_WEIGHT: 'GAIN',
  GAIN_MUSCLE: 'GAIN',
  MAINTAIN: 'MAINTAIN',
};

/** App -> interno: LOSE -> LOSE_WEIGHT, GAIN -> GAIN_WEIGHT, MAINTAIN -> MAINTAIN */
export function toGoalType(short: string): string {
  if (!short) return short;
  const normalized = short.toUpperCase();
  return GOAL_TYPE_SHORT_TO_LONG[normalized] ?? normalized;
}

/** Interno -> app: LOSE_WEIGHT -> LOSE, GAIN_WEIGHT/GAIN_MUSCLE -> GAIN, MAINTAIN -> MAINTAIN */
export function fromGoalType(long: string): GoalTypeShort {
  return GOAL_TYPE_LONG_TO_SHORT[long] ?? (long as GoalTypeShort);
}

/** Normaliza enum lowercase do app para UPPER do banco (Gender/ActivityLevel/DietType/GoalSpeed). Null-safe. */
export function toUpperEnum<T extends string | null | undefined>(value: T): T {
  return (value ? (value.toUpperCase() as T) : value) as T;
}

/** Normaliza enum UPPER do banco para lowercase do app. Null-safe. */
export function fromLowerEnum<T extends string | null | undefined>(value: T): T {
  return (value ? (value.toLowerCase() as T) : value) as T;
}

interface UserRow {
  id: string;
  email: string | null;
  provider?: string;
  emailVerified?: boolean;
  name?: string | null;
  locale?: string | null;
  countryCode?: string | null;
  timezone?: string | null;
  measurementSystem?: string | null;
  regionDetectionSource?: string | null;
  avatarUrl?: string | null;
  birthDate?: Date | string | null;
  gender?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  dietType?: string | null;
  exerciseCalories?: boolean;
  rolloverCalories?: boolean;
  notificationsOptIn?: boolean;
  onboardingCompleted?: boolean;
  healthConnectOptIn?: boolean;
  healthConnectOptInAt?: Date | string | null;
  createdAt?: Date | string;
  isAdmin?: boolean;
}

export function temporaryGuestName(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `User${(hash % 10_000).toString().padStart(4, '0')}`;
}

/** Row do Prisma (USER_SELECT) -> shape app: enums em lowercase, flags preservadas. */
export function serializeUser(user: UserRow) {
  const name =
    user.provider === 'GUEST' && (!user.name || user.name === 'My Peptides User')
      ? temporaryGuestName(user.id)
      : user.name;

  return {
    id: user.id,
    email: user.email,
    provider: fromLowerEnum(user.provider),
    accountSecured: Boolean(user.provider && user.provider !== 'GUEST'),
    emailVerified: user.emailVerified,
    name,
    locale: user.locale,
    countryCode: user.countryCode,
    timezone: user.timezone,
    measurementSystem: fromLowerEnum(user.measurementSystem),
    regionDetectionSource: fromLowerEnum(user.regionDetectionSource),
    avatarUrl: user.avatarUrl,
    birthDate: user.birthDate,
    gender: fromLowerEnum(user.gender),
    heightCm: user.heightCm,
    weightKg: user.weightKg,
    activityLevel: fromLowerEnum(user.activityLevel),
    dietType: fromLowerEnum(user.dietType),
    exerciseCalories: user.exerciseCalories,
    rolloverCalories: user.rolloverCalories,
    notificationsOptIn: user.notificationsOptIn,
    onboardingCompleted: user.onboardingCompleted,
    healthConnectOptIn: user.healthConnectOptIn,
    healthConnectOptInAt: user.healthConnectOptInAt,
    createdAt: user.createdAt,
    isAdmin: Boolean(user.isAdmin),
  };
}

interface GoalRow {
  id: string;
  dailyCalories: number;
  dailyProteinG?: number | null;
  dailyCarbsG?: number | null;
  dailyFatG?: number | null;
  dailyFiberG: number;
  waterMl?: number | null;
  type: string;
  goalSpeed?: string | null;
  targetWeightKg?: number | null;
  weeklyGoalKg?: number | null;
  startDate?: Date | string;
  targetDate?: Date | string | null;
  algorithmVersion?: string;
  calculationInputJson?: unknown;
  createdAt?: Date | string;
}

function goalStartWeightKg(goal: GoalRow): number | null {
  if (!goal.calculationInputJson || typeof goal.calculationInputJson !== 'object') return null;
  const value = (goal.calculationInputJson as { weightKg?: unknown }).weightKg;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Row do Prisma (Goal) -> shape app: dailyX renomeado p/ X, type curto, goalSpeed lowercase. */
export function serializeGoal(goal: GoalRow) {
  return {
    id: goal.id,
    calories: goal.dailyCalories,
    protein: goal.dailyProteinG,
    carbs: goal.dailyCarbsG,
    fat: goal.dailyFatG,
    fiberG: goal.dailyFiberG,
    waterMl: goal.waterMl,
    type: fromGoalType(goal.type),
    goalSpeed: fromLowerEnum(goal.goalSpeed),
    targetWeightKg: goal.targetWeightKg,
    weeklyGoalKg: goal.weeklyGoalKg ?? null,
    startWeightKg: goalStartWeightKg(goal),
    startDate: goal.startDate ?? goal.createdAt,
    targetDate: goal.targetDate ?? null,
    ...(goal.algorithmVersion ? { algorithmVersion: goal.algorithmVersion } : {}),
    createdAt: goal.createdAt,
  };
}
