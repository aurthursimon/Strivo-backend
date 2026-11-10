const USER_DIET_TYPES = new Set([
  'OMNIVORE',
  'VEGETARIAN',
  'VEGAN',
  'PESCATARIAN',
  'KETO',
  'CARNIVORE',
  'OTHER',
]);

function normalizeText(value: string): string {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function normalizeDietType(value: string): string {
  const normalized = normalizeText(value);
  if (normalized === 'CARNIVORA' || normalized === 'CARNIVORE') return 'CARNIVORE';
  return normalized || 'OTHER';
}

export function toUserDietType(dietType: string): string {
  return USER_DIET_TYPES.has(dietType) ? dietType : 'OTHER';
}

export function weeklyGoalFromSpeed(goalType: string, goalSpeed: string): number | undefined {
  if (goalType === 'MAINTAIN') return undefined;

  const speed = goalSpeed || 'MODERATE';
  if (goalType === 'LOSE_WEIGHT') {
    if (speed === 'SLOW') return 0.25;
    if (speed === 'FAST') return 0.75;
    return 0.5;
  }

  if (goalType === 'GAIN_MUSCLE') {
    if (speed === 'SLOW') return 0.1;
    if (speed === 'FAST') return 0.4;
    return 0.25;
  }

  if (speed === 'SLOW') return 0.15;
  if (speed === 'FAST') return 0.5;
  return 0.3;
}
