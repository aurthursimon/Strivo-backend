import {
  MAX_SCAN_INPUT_DIMENSION,
  MAX_SCAN_INPUT_PIXELS,
  SCAN_AI_MAX_DIMENSION,
} from '../constants';
import { isScanImageDimensionsAllowed } from '../image-processor';

describe('scan image resource limits', () => {
  it('keeps four conservative decode budgets below 400 MB', () => {
    expect(MAX_SCAN_INPUT_PIXELS * 4 * 8).toBeLessThanOrEqual(400_000_000);
  });

  it('accepts model-ready and standard 12 MP images but rejects 24 MP and 40 MP inputs', () => {
    expect(isScanImageDimensionsAllowed(SCAN_AI_MAX_DIMENSION, SCAN_AI_MAX_DIMENSION)).toBe(true);
    expect(isScanImageDimensionsAllowed(4_032, 3_024)).toBe(true);
    expect(isScanImageDimensionsAllowed(5_712, 4_284)).toBe(false);
    expect(isScanImageDimensionsAllowed(8_000, 5_000)).toBe(false);
    expect(isScanImageDimensionsAllowed(MAX_SCAN_INPUT_DIMENSION + 1, 1)).toBe(false);
  });
});
