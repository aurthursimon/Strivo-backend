import { z } from 'zod';

export const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);
export const activityLevelEnum = z.enum([
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
]);

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  locale: z.string().optional(),
  birthDate: z.string().date().optional(),
  gender: genderEnum.optional(),
  heightCm: z.number().min(50).max(300).optional(),
  weightKg: z.number().min(20).max(500).optional(),
  activityLevel: activityLevelEnum.optional(),
});

export type Gender = z.infer<typeof genderEnum>;
export type ActivityLevel = z.infer<typeof activityLevelEnum>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
