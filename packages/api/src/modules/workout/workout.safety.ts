import { Injectable } from '@nestjs/common';

export const WORKOUT_HARD_BLOCK_CONDITION_SLUGS = [
  'recent-heart-surgery',
  'severe-cardiac-condition',
  'unstable-angina',
  'uncontrolled-hypertension',
  'recent-stroke',
  'severe-osteoporosis',
  'active-fracture',
] as const;

export const WORKOUT_CONSULT_REQUIRED_CONDITION_SLUGS = [
  'hypertension',
  'type-1-diabetes',
  'type-2-diabetes',
  'asthma',
  'chronic-back-pain',
  'arthritis',
  'pregnancy',
] as const;

export type SafetyVerdict = 'SAFE' | 'CONSULT_REQUIRED' | 'BLOCKED';

const NO_REPORTED_CONDITION_SLUGS = new Set(['nenhuma', 'none', 'no-condition', 'no-conditions']);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function hasAnySlug(conditions: string[], slugs: readonly string[]): boolean {
  const normalized = new Set(conditions.map(normalize));
  return slugs.some((slug) => normalized.has(slug));
}

@Injectable()
export class WorkoutSafetyService {
  /** Classifica slugs de condicoes de saude: BLOCKED > CONSULT_REQUIRED > SAFE. */
  classify(conditions: string[] = []): SafetyVerdict {
    if (!conditions.length) return 'SAFE';
    if (hasAnySlug(conditions, WORKOUT_HARD_BLOCK_CONDITION_SLUGS)) return 'BLOCKED';
    if (hasAnySlug(conditions, WORKOUT_CONSULT_REQUIRED_CONDITION_SLUGS)) {
      return 'CONSULT_REQUIRED';
    }
    const normalized = conditions.map(normalize);
    return normalized.every((condition) => NO_REPORTED_CONDITION_SLUGS.has(condition))
      ? 'SAFE'
      : 'CONSULT_REQUIRED';
  }

  blockedMessage(locale: string): string {
    if (locale.startsWith('en')) {
      return 'Workout generation is blocked for the reported health condition. Please seek professional guidance.';
    }
    if (locale.startsWith('es')) {
      return 'La generación del entrenamiento está bloqueada por la condición de salud informada. Busca orientación profesional.';
    }
    return 'Geracao de treino bloqueada por condicao de saude relatada. Procure orientacao profissional.';
  }
}

/** Back-compatible pure helper for existing tests/imports. */
export function classifyHealthConditions(conditions: string[]): SafetyVerdict {
  return new WorkoutSafetyService().classify(conditions);
}
