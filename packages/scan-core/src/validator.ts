import { MAX_SCAN_RESULT_ITEMS } from './constants';
import { NoFoodDetectedError, UncertainFoodIdentificationError } from './errors';
import type { ScanItem, ScanResult } from './types';

const GENERIC_FOOD_NAMES = new Set([
  'food',
  'meal',
  'dish',
  'item',
  'unknown',
  'unknown food',
  'unknown food item',
  'unknown meal',
  'unknown dish',
  'comida',
  'alimento',
  'refeicao',
  'prato',
  'plato',
  'desconhecido',
  'alimento desconhecido',
  'comida desconocida',
  'alimento desconocido',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function requiredFiniteNumber(value: unknown, field: string): number {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Invalid scan result: missing ${field}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid scan result: invalid ${field}`);
  }
  return parsed;
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function normalizedFoodName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function assertSpecificFoodName(value: unknown): asserts value is string {
  const normalized = normalizedFoodName(value);
  if (!normalized || GENERIC_FOOD_NAMES.has(normalized)) {
    throw new UncertainFoodIdentificationError();
  }
}

function validateItem(item: ScanItem): ScanItem {
  assertSpecificFoodName(item.name);
  const portion = requiredFiniteNumber(item.estimated_portion_g, 'estimated_portion_g');
  if (portion <= 0) throw new Error('Invalid scan result: invalid portion');
  if (typeof item.portion_label !== 'string' || !item.portion_label.trim()) {
    throw new Error('Invalid scan result: missing portion_label');
  }

  const estimatedPortionG = round(clamp(portion, 1, 2_000));
  const proteinG = round(
    clamp(requiredFiniteNumber(item.protein_g, 'protein_g'), 0, estimatedPortionG),
  );
  const carbsG = round(
    clamp(requiredFiniteNumber(item.carbs_g, 'carbs_g'), 0, estimatedPortionG * 1.05),
  );
  const fatG = round(clamp(requiredFiniteNumber(item.fat_g, 'fat_g'), 0, estimatedPortionG));
  const fiberG = round(clamp(requiredFiniteNumber(item.fiber_g, 'fiber_g'), 0, estimatedPortionG));
  const macroCalories = proteinG * 4 + carbsG * 4 + fatG * 9;
  let calories = clamp(requiredFiniteNumber(item.calories, 'calories'), 0, estimatedPortionG * 10);
  if (
    macroCalories > 20 &&
    Math.abs(calories - macroCalories) > Math.max(80, macroCalories * 0.55)
  ) {
    calories = macroCalories;
  }

  return {
    name: item.name.trim(),
    estimated_portion_g: estimatedPortionG,
    portion_label: item.portion_label.trim(),
    calories: Math.round(calories),
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    fiber_g: fiberG,
    confidence: round(clamp(requiredFiniteNumber(item.confidence, 'confidence'), 0, 1), 2),
  };
}

export function validateScanResult(raw: ScanResult): ScanResult {
  if (raw?.contains_food === false) throw new NoFoodDetectedError();
  if (raw?.contains_food !== true) {
    throw new Error('Invalid scan result: food classification missing');
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('Invalid scan result: no items found');
  }
  if (raw.items.length > MAX_SCAN_RESULT_ITEMS) {
    throw new Error('Invalid scan result: too many items');
  }

  const items = raw.items.map(validateItem);
  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  const averageConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
  return {
    contains_food: true,
    items,
    meal_description: typeof raw.meal_description === 'string' ? raw.meal_description : '',
    total_estimated_calories: totalCalories,
    overall_confidence: Math.round(averageConfidence * 100) / 100,
  };
}
