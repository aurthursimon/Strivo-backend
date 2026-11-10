export interface ScanItem {
  name: string;
  estimated_portion_g: number;
  portion_label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;
}

export interface ScanResult {
  contains_food: boolean;
  items: ScanItem[];
  meal_description: string;
  total_estimated_calories: number;
  overall_confidence: number;
  portion_calibration?: {
    source: 'user_history';
    raw_items: Array<{ name: string; estimated_portion_g: number }>;
  };
}

export interface AiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface AnalyzeOptions {
  timeoutMs?: number;
  model?: string;
  reasoningEffort?: 'medium' | 'high';
  promptOverride?: string;
  geminiThinkingBudget?: number;
  geminiLegacyUnconfigured?: boolean;
  maxOutputTokens?: number;
  onUsage?: (usage: AiUsage) => void;
}

export interface VisionProvider {
  readonly name: string;
  analyze(imageBuffer: Buffer, locale: string, options?: AnalyzeOptions): Promise<ScanResult>;
}

export interface ProcessedScanImage {
  buffer: Buffer;
  perceptualHash: string;
}

export interface ScanImageProcessor {
  process(buffer: Buffer): Promise<ProcessedScanImage>;
}

export interface PortionCalibrationProfile {
  byFood: ReadonlyMap<string, readonly number[]>;
}

export interface PortionCalibrationLoader {
  loadProfile(userId: string): Promise<PortionCalibrationProfile | undefined>;
}

export interface ScanCoreLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface AnalyzeMealInput {
  image: Buffer;
  locale: string;
  userId: string;
}

export interface AnalyzeMealOutput {
  result: ScanResult;
  provider: string;
  imageHash: string;
}
