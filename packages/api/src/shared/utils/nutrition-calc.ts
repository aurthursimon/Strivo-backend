type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
type GoalType = 'LOSE_WEIGHT' | 'GAIN_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE';

export const NUTRITION_ALGORITHM_VERSION = 'mifflin-st-jeor-v5-disclosed-adult-targets';
export const NUTRITION_ALGORITHM_REVIEW_STATUS = 'PENDING_CLINICAL_APPROVAL';
export const MINIMUM_NUTRITION_AGE_YEARS = 18;

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

const PROTEIN_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.3,
  MODERATE: 1.4,
  ACTIVE: 1.5,
  VERY_ACTIVE: 1.6,
};

const ACTIVITY_WATER_ML: Record<ActivityLevel, number> = {
  SEDENTARY: 0,
  LIGHT: 150,
  MODERATE: 300,
  ACTIVE: 500,
  VERY_ACTIVE: 750,
};

export interface BmrInput {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}

export interface TdeeInput extends BmrInput {
  activityLevel: ActivityLevel;
}

export interface MacrosInput {
  tdee: number;
  goalType: GoalType;
  weightKg: number;
  heightCm?: number;
  ageYears?: number;
  gender?: Gender;
  activityLevel?: ActivityLevel;
  dietType?: string;
  weeklyGoalKg?: number;
}

export interface WaterInput {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  activityLevel: ActivityLevel;
}

export interface MacrosResult {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface TdeeResult {
  bmr: number;
  tdee: number;
  waterMl: number;
  macros: MacrosResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeDietType(dietType?: string): string {
  const normalized =
    dietType
      ?.trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') ?? 'OMNIVORE';
  return normalized === 'CARNIVORA' ? 'CARNIVORE' : normalized;
}

/**
 * Caps the weight used for protein, fat and hydration at BMI 30. BMR still uses
 * actual weight. This prevents linear gram/ml targets from becoming excessive
 * for people with a high BMI while preserving the validated Mifflin input.
 */
function referenceWeightKg(weightKg: number, heightCm?: number): number {
  if (!heightCm) return weightKg;
  const heightM = heightCm / 100;
  return Math.min(weightKg, 30 * heightM * heightM);
}

/** Dietary Reference Intake: 14 g of fiber per 1,000 kcal. */
export function calculateFiberG(dailyCalories: number, dietType?: string): number {
  const normalizedDiet = normalizeDietType(dietType);
  if (normalizedDiet === 'CARNIVORE') return 0;

  const calorieTarget = Math.round((dailyCalories * 14) / 1000);
  return normalizedDiet === 'KETO' ? Math.min(calorieTarget, 25) : calorieTarget;
}

/**
 * Mifflin-St Jeor resting energy equation.
 * Male:   10 * weight(kg) + 6.25 * height(cm) - 5 * age(y) + 5
 * Female: 10 * weight(kg) + 6.25 * height(cm) - 5 * age(y) - 161
 * Undisclosed/other uses the midpoint and therefore does not assume either sex.
 */
export function calculateBmr(input: BmrInput): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  const offset = input.gender === 'MALE' ? 5 : input.gender === 'FEMALE' ? -161 : -78;
  return Math.round(base + offset);
}

export function calculateTdee(input: TdeeInput): number {
  const bmr = calculateBmr(input);
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[input.activityLevel]);
}

function calorieFloor(gender?: Gender, ageYears?: number): number {
  if (ageYears !== undefined && ageYears < MINIMUM_NUTRITION_AGE_YEARS) {
    throw new RangeError('Nutrition targets are available only for adults.');
  }
  if (gender === 'MALE') return 1500;
  if (gender === 'FEMALE') return 1200;
  return 1350;
}

function calculateDailyCalories(input: MacrosInput): number {
  const requestedWeeklyChange = Math.max(input.weeklyGoalKg ?? 0, 0);
  const requestedDailyAdjustment = (requestedWeeklyChange * 7700) / 7;

  if (input.goalType === 'LOSE_WEIGHT') {
    const defaultDeficit = (0.5 * 7700) / 7;
    const requestedDeficit =
      input.weeklyGoalKg === undefined ? defaultDeficit : requestedDailyAdjustment;
    const safeDeficit = Math.min(requestedDeficit, input.tdee * 0.25);
    return Math.round(
      Math.max(input.tdee - safeDeficit, calorieFloor(input.gender, input.ageYears)),
    );
  }

  if (input.goalType === 'GAIN_WEIGHT' || input.goalType === 'GAIN_MUSCLE') {
    const defaultWeeklyGain = input.goalType === 'GAIN_MUSCLE' ? 0.25 : 0.3;
    const requestedSurplus =
      input.weeklyGoalKg === undefined ? (defaultWeeklyGain * 7700) / 7 : requestedDailyAdjustment;
    const maximumSurplus = input.tdee * (input.goalType === 'GAIN_MUSCLE' ? 0.1 : 0.15);
    return Math.round(input.tdee + Math.min(requestedSurplus, maximumSurplus));
  }

  return Math.round(input.tdee);
}

function calculateProteinG(input: MacrosInput, dailyCalories: number): number {
  const activityLevel = input.activityLevel ?? 'MODERATE';
  let factor = PROTEIN_FACTORS[activityLevel];
  if (input.goalType === 'GAIN_MUSCLE') factor += 0.2;
  if ((input.ageYears ?? 0) >= 65) factor += 0.1;

  // GLP-1/active-weight-loss guidance supports 1.2-1.6 g/kg/day. The only
  // higher range is reserved for an explicit muscle-gain objective, where
  // sports-nutrition guidance supports up to 2.0 g/kg/day.
  const maximumFactor = input.goalType === 'GAIN_MUSCLE' ? 2 : 1.6;
  const target =
    referenceWeightKg(input.weightKg, input.heightCm) * clamp(factor, 1.2, maximumFactor);
  const calorieLimitedMaximum = (dailyCalories * 0.35) / 4;
  return Math.round(Math.min(target, calorieLimitedMaximum));
}

/**
 * Produces an internally consistent macro target. Protein responds to activity,
 * age and objective; fat stays within 20-35% for standard diets; carbohydrate
 * receives the remaining energy. Keto and carnivore profiles use their own
 * carbohydrate ceilings and put the remaining energy into fat.
 */
export function calculateMacros(input: MacrosInput): MacrosResult {
  const dailyCalories = calculateDailyCalories(input);
  const proteinG = calculateProteinG(input, dailyCalories);
  const dietType = normalizeDietType(input.dietType);
  const availableAfterProtein = Math.max(dailyCalories - proteinG * 4, 0);

  let carbsG: number;
  let fatG: number;

  if (dietType === 'CARNIVORE') {
    // Animal-only plans can still contain small amounts of lactose from dairy.
    // A low, non-zero ceiling keeps the target compatible with the seeded menu
    // instead of marking every dairy-containing day as invalid by definition.
    carbsG = 20;
    fatG = Math.round(Math.max((availableAfterProtein - carbsG * 4) / 9, 0));
  } else if (dietType === 'KETO') {
    carbsG = Math.round(Math.min(50, Math.max(20, (dailyCalories * 0.08) / 4)));
    fatG = Math.round(Math.max((availableAfterProtein - carbsG * 4) / 9, 0));
  } else {
    const metabolicWeight = referenceWeightKg(input.weightKg, input.heightCm);
    const minimumFatG = (dailyCalories * 0.2) / 9;
    const maximumFatG = (dailyCalories * 0.35) / 9;
    const desiredFatG = metabolicWeight * 0.8;
    fatG = Math.round(clamp(desiredFatG, minimumFatG, maximumFatG));
    carbsG = Math.round(Math.max((availableAfterProtein - fatG * 9) / 4, 0));
  }

  const fiberG = calculateFiberG(dailyCalories, dietType);
  return { dailyCalories, proteinG, carbsG, fatG, fiberG };
}

/**
 * Daily beverage target. It combines the National Academies beverage AI
 * reference (roughly 80% of total water) with body size and adds a practical
 * activity allowance. Food moisture is not counted in the app's water card.
 */
export function calculateWaterMl(input: WaterInput): number {
  const adultReference = input.gender === 'MALE' ? 3000 : input.gender === 'FEMALE' ? 2200 : 2600;
  const adolescentReference =
    input.gender === 'MALE' ? 2600 : input.gender === 'FEMALE' ? 1800 : 2200;
  const beverageReference = input.ageYears < 19 ? adolescentReference : adultReference;
  const sizeBasedTarget = referenceWeightKg(input.weightKg, input.heightCm) * 35;
  const raw = Math.max(beverageReference, sizeBasedTarget) + ACTIVITY_WATER_ML[input.activityLevel];
  return clamp(Math.round(raw / 50) * 50, 1500, 5000);
}

export function calculateAll(
  input: TdeeInput & { goalType: GoalType; dietType?: string; weeklyGoalKg?: number },
): TdeeResult {
  const bmr = calculateBmr(input);
  const tdee = calculateTdee(input);
  const macros = calculateMacros({
    tdee,
    goalType: input.goalType,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    ageYears: input.ageYears,
    gender: input.gender,
    activityLevel: input.activityLevel,
    dietType: input.dietType,
    weeklyGoalKg: input.weeklyGoalKg,
  });
  const waterMl = calculateWaterMl(input);

  return { bmr, tdee, waterMl, macros };
}

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
