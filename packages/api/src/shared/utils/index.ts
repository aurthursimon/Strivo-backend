export {
  calculateBmr,
  calculateTdee,
  calculateFiberG,
  calculateWaterMl,
  calculateMacros,
  calculateAll,
  calculateAge,
  NUTRITION_ALGORITHM_VERSION,
  NUTRITION_ALGORITHM_REVIEW_STATUS,
  MINIMUM_NUTRITION_AGE_YEARS,
  type BmrInput,
  type TdeeInput,
  type MacrosInput,
  type MacrosResult,
  type WaterInput,
  type TdeeResult,
} from './nutrition-calc';
export { normalizeDietType, toUserDietType, weeklyGoalFromSpeed } from './plan-profile';
