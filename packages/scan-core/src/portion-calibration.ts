import type { PortionCalibrationProfile, ScanItem, ScanResult } from './types';

export interface CalibrationRawItem {
  name: string;
  estimatedPortionG: number;
}

export interface CalibrationSavedItem {
  name: string;
  portionG: number;
}

export interface CalibrationFeedbackEvent {
  rawItems: readonly CalibrationRawItem[];
  savedItems: readonly CalibrationSavedItem[];
}

export const EMPTY_CALIBRATION_PROFILE: PortionCalibrationProfile = {
  byFood: new Map(),
};

export function normalizeFoodName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number);
}

function correctionFactor(samples: readonly number[], minimumSamples: number): number {
  if (samples.length < minimumSamples) return 1;
  const center = median(samples);
  const evidenceWeight = Math.min(samples.length / (samples.length + 2), 0.85);
  const shrunk = Math.exp(Math.log(center) * evidenceWeight);
  return Math.min(1.6, Math.max(0.6, shrunk));
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function scaleItem(item: ScanItem, factor: number): ScanItem {
  if (Math.abs(factor - 1) < 0.05) return item;
  return {
    ...item,
    estimated_portion_g: Math.max(1, Math.round(item.estimated_portion_g * factor)),
    calories: Math.max(0, Math.round(item.calories * factor)),
    protein_g: Math.max(0, round(item.protein_g * factor)),
    carbs_g: Math.max(0, round(item.carbs_g * factor)),
    fat_g: Math.max(0, round(item.fat_g * factor)),
    fiber_g: Math.max(0, round(item.fiber_g * factor)),
  };
}

export function buildPortionCalibrationProfile(
  events: readonly CalibrationFeedbackEvent[],
): PortionCalibrationProfile {
  const byFood = new Map<string, number[]>();
  for (const event of events.slice(0, 40)) {
    for (const original of event.rawItems) {
      if (!original.name || !Number.isFinite(original.estimatedPortionG)) continue;
      if (original.estimatedPortionG <= 0) continue;
      const key = normalizeFoodName(original.name);
      const saved = event.savedItems.find((item) => normalizeFoodName(item.name) === key);
      if (!saved || !Number.isFinite(saved.portionG) || saved.portionG <= 0) continue;
      const ratio = saved.portionG / original.estimatedPortionG;
      if (ratio < 0.25 || ratio > 4) continue;
      const samples = byFood.get(key) ?? [];
      samples.push(ratio);
      byFood.set(key, samples);
    }
  }
  return byFood.size === 0 ? EMPTY_CALIBRATION_PROFILE : { byFood };
}

export function applyPortionCalibration(
  result: ScanResult,
  profile: PortionCalibrationProfile | undefined,
): ScanResult {
  if (!profile) return result;
  let changed = false;
  const items = result.items.map((item) => {
    const factor = correctionFactor(profile.byFood.get(normalizeFoodName(item.name)) ?? [], 2);
    const scaled = scaleItem(item, factor);
    changed ||= scaled !== item;
    return scaled;
  });
  if (!changed) return result;
  return {
    ...result,
    items,
    total_estimated_calories: items.reduce((sum, item) => sum + item.calories, 0),
    portion_calibration: {
      source: 'user_history',
      raw_items: result.items.map((item) => ({
        name: item.name,
        estimated_portion_g: item.estimated_portion_g,
      })),
    },
  };
}

export function calibrationRawItems(result: ScanResult): CalibrationRawItem[] {
  const traced = result.portion_calibration?.raw_items;
  const source = traced?.length ? traced : result.items;
  return source.map((item) => ({
    name: item.name,
    estimatedPortionG: item.estimated_portion_g,
  }));
}
