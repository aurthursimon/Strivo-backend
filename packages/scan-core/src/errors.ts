export class NoFoodDetectedError extends Error {
  readonly code = 'NO_FOOD_DETECTED';

  constructor() {
    super('NO_FOOD_DETECTED');
    this.name = 'NoFoodDetectedError';
  }
}

export class UncertainFoodIdentificationError extends Error {
  readonly code = 'UNCERTAIN_FOOD_IDENTIFICATION';

  constructor() {
    super('UNCERTAIN_FOOD_IDENTIFICATION');
    this.name = 'UncertainFoodIdentificationError';
  }
}

export class InvalidScanImageError extends Error {
  readonly code = 'IMAGE_INVALID';

  constructor() {
    super('Image is invalid, corrupt, unsupported, or too large.');
    this.name = 'InvalidScanImageError';
  }
}

export class ScanProvidersUnavailableError extends Error {
  readonly code = 'AI_ANALYSIS_UNAVAILABLE';

  constructor() {
    super('All scan providers are unavailable.');
    this.name = 'ScanProvidersUnavailableError';
  }
}
