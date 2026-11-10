import type { ScanResult } from './types';

export interface SerializedScanItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  portion: number;
  unit: string;
  confidence: number;
}

export interface SerializedScanResult {
  items: SerializedScanItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  confidence: number;
}

export function serializeScanResult(result: ScanResult, scanId: string): SerializedScanResult {
  const items = result.items.map((item, index) => ({
    id: `${scanId}-${index}`,
    name: item.name,
    calories: item.calories,
    protein: item.protein_g,
    carbs: item.carbs_g,
    fat: item.fat_g,
    fiber: item.fiber_g,
    portion: item.estimated_portion_g,
    unit: item.portion_label || 'g',
    confidence: item.confidence,
  }));
  return {
    items,
    totalCalories: result.total_estimated_calories,
    totalProtein: items.reduce((sum, item) => sum + item.protein, 0),
    totalCarbs: items.reduce((sum, item) => sum + item.carbs, 0),
    totalFat: items.reduce((sum, item) => sum + item.fat, 0),
    totalFiber: items.reduce((sum, item) => sum + item.fiber, 0),
    confidence: result.overall_confidence,
  };
}
