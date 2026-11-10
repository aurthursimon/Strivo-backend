export const MAX_SCAN_RESULT_ITEMS = 50;
export const SCAN_AI_MAX_DIMENSION = 1024;
export const SCAN_AI_JPEG_QUALITY = 85;
// Four concurrent decodes stay below 400 MB at a conservative 8 bytes per pixel.
// The mobile client resizes to SCAN_AI_MAX_DIMENSION before upload, so this guard
// rejects oversized direct uploads without reducing model input quality.
export const MAX_SCAN_INPUT_PIXELS = 12_500_000;
export const MAX_SCAN_INPUT_DIMENSION = 6_000;
export const GEMINI_SCAN_MAX_OUTPUT_TOKENS = 1_600;
export const OPENAI_SCAN_MAX_OUTPUT_TOKENS = 4_096;
export const DEFAULT_GEMINI_SCAN_MODEL = 'gemini-2.5-flash-lite';
export const DEFAULT_OPENAI_SCAN_MODEL = 'gpt-5-nano';
