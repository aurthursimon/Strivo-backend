export const APP_NAME = 'StrivoMax AI';
export const THEME_COLOR = '#10B981';
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'pt', 'es'] as const;

export const TRIAL_DAYS = 3;
export const FREE_SCANS_PER_DAY = 5;
export const PRO_SCANS_PER_DAY = 5;

// Keeps the AI response and the authenticated meal-save contract aligned while
// still bounding untrusted request payloads.
export const MAX_SCAN_RESULT_ITEMS = 50;

export const MAX_IMAGE_SIZE_MB = 10;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
