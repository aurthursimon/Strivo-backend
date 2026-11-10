import { MAX_SCAN_RESULT_ITEMS } from './constants';

export const SCAN_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contains_food',
    'items',
    'meal_description',
    'total_estimated_calories',
    'overall_confidence',
  ],
  properties: {
    contains_food: { type: 'boolean' },
    items: {
      type: 'array',
      maxItems: MAX_SCAN_RESULT_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'estimated_portion_g',
          'portion_label',
          'calories',
          'protein_g',
          'carbs_g',
          'fat_g',
          'fiber_g',
          'confidence',
        ],
        properties: {
          name: {
            type: 'string',
            description: 'Specific visible edible food name, never a generic label.',
          },
          estimated_portion_g: { type: 'number', minimum: 1, maximum: 2_000 },
          portion_label: { type: 'string' },
          calories: { type: 'number', minimum: 0, maximum: 5_000 },
          protein_g: { type: 'number', minimum: 0, maximum: 500 },
          carbs_g: { type: 'number', minimum: 0, maximum: 500 },
          fat_g: { type: 'number', minimum: 0, maximum: 500 },
          fiber_g: { type: 'number', minimum: 0, maximum: 200 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    meal_description: { type: 'string' },
    total_estimated_calories: { type: 'number', minimum: 0, maximum: 20_000 },
    overall_confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;
