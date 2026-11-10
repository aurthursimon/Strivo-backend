/**
 * Serializers puros de NotificationPreference (DB row <-> shape app).
 *
 * Contrato D1: o banco mantem a forma canonica (par boolean + string *Time por
 * refeicao). A adaptacao para o shape do app (cada refeicao como "HH:mm" | null)
 * acontece SO na borda. Funcoes puras, sem dependencia de Nest/Prisma — espelha
 * o padrao de meal.serializer.ts.
 *
 * NAO importar de common/ nem de @prisma/client (runtime). O barrel
 * transitivamente toca config, que faz process.exit sem env. Tudo local ao modulo.
 */

/** Row "duck-typed" de NotificationPreference. Campos internos extras sao aceitos e ignorados. */
interface PrefRow {
  breakfast: boolean;
  breakfastTime: string;
  lunch: boolean;
  lunchTime: string;
  afternoonSnack: boolean;
  afternoonSnackTime: string;
  dinner: boolean;
  dinnerTime: string;
  water: boolean;
  waterIntervalH: number;
  waterStartTime: string;
  waterEndTime: string;
  workout: boolean;
  workoutTime: string;
  workoutDaysJson: unknown;
  progressCheck: boolean;
  progressCheckTime: string;
  progressCheckWeekday: number;
  streakRisk: boolean;
  streakRiskTime: string;
  pushEnabled: boolean;
  // Campos internos aceitos mas nunca expostos no output:
  id?: string;
  userId?: string;
  pushSubscription?: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/** Shape app de uma preferencia serializada. */
export interface SerializedPreferences {
  pushEnabled: boolean;
  breakfast: string | null;
  lunch: string | null;
  afternoonSnack: string | null;
  dinner: string | null;
  water: boolean;
  waterIntervalH: number;
  waterStartTime: string;
  waterEndTime: string;
  workout: boolean;
  workoutTime: string;
  workoutDays: number[];
  progressCheck: boolean;
  progressCheckTime: string;
  progressCheckWeekday: number;
  streakRisk: boolean;
  streakRiskTime: string;
}

/** Input do app (PATCH parcial). Refeicoes: string (ativa+hora), null (desativa), undefined (intocado). */
export interface UpdatePreferencesInput {
  breakfast?: string | null;
  lunch?: string | null;
  afternoonSnack?: string | null;
  dinner?: string | null;
  water?: boolean;
  waterIntervalH?: number;
  waterStartTime?: string;
  waterEndTime?: string;
  workout?: boolean;
  workoutTime?: string;
  workoutDays?: number[];
  progressCheck?: boolean;
  progressCheckTime?: string;
  progressCheckWeekday?: number;
  streakRisk?: boolean;
  streakRiskTime?: string;
  pushEnabled?: boolean;
}

/** Objeto parcial compativel com Prisma NotificationPreferenceUpdateInput (sem importar Prisma). */
interface MappedPreferences {
  breakfast?: boolean;
  breakfastTime?: string;
  lunch?: boolean;
  lunchTime?: string;
  afternoonSnack?: boolean;
  afternoonSnackTime?: string;
  dinner?: boolean;
  dinnerTime?: string;
  water?: boolean;
  waterIntervalH?: number;
  waterStartTime?: string;
  waterEndTime?: string;
  workout?: boolean;
  workoutTime?: string;
  workoutDaysJson?: number[];
  progressCheck?: boolean;
  progressCheckTime?: string;
  progressCheckWeekday?: number;
  streakRisk?: boolean;
  streakRiskTime?: string;
  pushEnabled?: boolean;
}

/** DB row -> shape app: refeicao ativa vira "HH:mm", desativada vira null. Sem campos internos. */
export function serializePreferences(pref: PrefRow): SerializedPreferences {
  const workoutDays = Array.isArray(pref.workoutDaysJson)
    ? pref.workoutDaysJson.filter(
        (day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
      )
    : [];
  return {
    pushEnabled: pref.pushEnabled,
    breakfast: pref.breakfast ? pref.breakfastTime : null,
    lunch: pref.lunch ? pref.lunchTime : null,
    afternoonSnack: pref.afternoonSnack ? pref.afternoonSnackTime : null,
    dinner: pref.dinner ? pref.dinnerTime : null,
    water: pref.water,
    waterIntervalH: pref.waterIntervalH,
    waterStartTime: pref.waterStartTime,
    waterEndTime: pref.waterEndTime,
    workout: pref.workout,
    workoutTime: pref.workoutTime,
    workoutDays,
    progressCheck: pref.progressCheck,
    progressCheckTime: pref.progressCheckTime,
    progressCheckWeekday: pref.progressCheckWeekday,
    streakRisk: pref.streakRisk,
    streakRiskTime: pref.streakRiskTime,
  };
}

/**
 * App PATCH dto -> dados parciais para Prisma update.
 * - refeicao === undefined: chave ausente (intocado)
 * - refeicao === null: { [meal]: false } (desativa; NAO mexe no *Time existente)
 * - refeicao === string: { [meal]: true, [meal]Time: value }
 * water/waterIntervalH/streakRisk/pushEnabled: incluidos so quando != undefined.
 */
export function mapPreferencesInput(input: UpdatePreferencesInput): MappedPreferences {
  const result: MappedPreferences = {};

  if (input.breakfast !== undefined) {
    if (input.breakfast === null) {
      result.breakfast = false;
    } else {
      result.breakfast = true;
      result.breakfastTime = input.breakfast;
    }
  }
  if (input.lunch !== undefined) {
    if (input.lunch === null) {
      result.lunch = false;
    } else {
      result.lunch = true;
      result.lunchTime = input.lunch;
    }
  }
  if (input.afternoonSnack !== undefined) {
    if (input.afternoonSnack === null) {
      result.afternoonSnack = false;
    } else {
      result.afternoonSnack = true;
      result.afternoonSnackTime = input.afternoonSnack;
    }
  }
  if (input.dinner !== undefined) {
    if (input.dinner === null) {
      result.dinner = false;
    } else {
      result.dinner = true;
      result.dinnerTime = input.dinner;
    }
  }

  if (input.water !== undefined) {
    result.water = input.water;
  }
  if (input.waterIntervalH !== undefined) {
    result.waterIntervalH = input.waterIntervalH;
  }
  if (input.waterStartTime !== undefined) result.waterStartTime = input.waterStartTime;
  if (input.waterEndTime !== undefined) result.waterEndTime = input.waterEndTime;
  if (input.workout !== undefined) result.workout = input.workout;
  if (input.workoutTime !== undefined) result.workoutTime = input.workoutTime;
  if (input.workoutDays !== undefined) result.workoutDaysJson = input.workoutDays;
  if (input.progressCheck !== undefined) result.progressCheck = input.progressCheck;
  if (input.progressCheckTime !== undefined) result.progressCheckTime = input.progressCheckTime;
  if (input.progressCheckWeekday !== undefined) {
    result.progressCheckWeekday = input.progressCheckWeekday;
  }
  if (input.streakRisk !== undefined) {
    result.streakRisk = input.streakRisk;
  }
  if (input.streakRiskTime !== undefined) result.streakRiskTime = input.streakRiskTime;
  if (input.pushEnabled !== undefined) {
    result.pushEnabled = input.pushEnabled;
  }

  return result;
}
