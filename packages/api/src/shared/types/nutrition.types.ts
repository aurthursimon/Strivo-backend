export type GoalType = 'LOSE_WEIGHT' | 'GAIN_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE';
export type FoodSource = 'TACO' | 'USDA' | 'AI_GENERATED';

export interface GoalResponse {
  id: string;
  type: GoalType;
  targetWeightKg: number | null;
  dailyCalories: number;
  dailyProteinG: number | null;
  dailyCarbsG: number | null;
  dailyFatG: number | null;
  dailyFiberG: number;
  weeklyGoalKg: number | null;
  startDate: string;
  targetDate: string | null;
  isActive: boolean;
}

export interface FoodItemResponse {
  id: string;
  name: string;
  category: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  defaultPortionG: number | null;
  defaultPortionLabel: string | null;
  source: FoodSource;
}

export interface FoodSearchResult {
  items: FoodItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface WaterEntryResponse {
  id: string;
  amountMl: number;
  loggedAt: string;
}

export interface DailyLogResponse {
  id: string;
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalWaterMl: number;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  weightKg: number | null;
  waterEntries: WaterEntryResponse[];
}

export interface StreakResponse {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}
