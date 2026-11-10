import { NoFoodDetectedError, ScanProvidersUnavailableError } from '../errors';
import { ScanAnalyzer } from '../scan-analyzer';
import type { ScanResult, VisionProvider } from '../types';

const result: ScanResult = {
  contains_food: true,
  items: [
    {
      name: 'Arroz',
      estimated_portion_g: 100,
      portion_label: '1 porcao',
      calories: 130,
      protein_g: 2.5,
      carbs_g: 28,
      fat_g: 0.3,
      fiber_g: 1.6,
      confidence: 0.9,
    },
  ],
  meal_description: 'Arroz',
  total_estimated_calories: 130,
  overall_confidence: 0.9,
};

function provider(name: string, analyze: VisionProvider['analyze']): VisionProvider {
  return { name, analyze };
}

function analyzer(primary: VisionProvider, fallback: VisionProvider): ScanAnalyzer {
  return new ScanAnalyzer({
    primary,
    fallback,
    imageProcessor: {
      process: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
    },
  });
}

describe('ScanAnalyzer', () => {
  it('uses the primary provider when it succeeds', async () => {
    const primary = provider('gemini', jest.fn().mockResolvedValue(result));
    const fallback = provider('openai', jest.fn());

    await expect(
      analyzer(primary, fallback).analyze({
        image: Buffer.from('input'),
        locale: 'pt-BR',
        userId: 'u1',
      }),
    ).resolves.toEqual({ result, provider: 'gemini', imageHash: 'p' });
    expect(fallback.analyze).not.toHaveBeenCalled();
  });

  it('falls back to OpenAI after a Gemini failure', async () => {
    const primary = provider('gemini', jest.fn().mockRejectedValue(new Error('provider down')));
    const fallback = provider('openai', jest.fn().mockResolvedValue(result));

    await expect(
      analyzer(primary, fallback).analyze({
        image: Buffer.from('input'),
        locale: 'pt-BR',
        userId: 'u1',
      }),
    ).resolves.toMatchObject({ provider: 'openai', result });
  });

  it('does not call fallback when the primary classifies no food', async () => {
    const primary = provider('gemini', jest.fn().mockRejectedValue(new NoFoodDetectedError()));
    const fallback = provider('openai', jest.fn());

    await expect(
      analyzer(primary, fallback).analyze({
        image: Buffer.from('input'),
        locale: 'pt-BR',
        userId: 'u1',
      }),
    ).rejects.toBeInstanceOf(NoFoodDetectedError);
    expect(fallback.analyze).not.toHaveBeenCalled();
  });

  it('fails straight to ScanProvidersUnavailableError with no fallback configured', async () => {
    const primary = provider('openai', jest.fn().mockRejectedValue(new Error('down')));

    await expect(
      new ScanAnalyzer({
        primary,
        imageProcessor: {
          process: jest
            .fn()
            .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
        },
      }).analyze({ image: Buffer.from('input'), locale: 'pt-BR', userId: 'u1' }),
    ).rejects.toBeInstanceOf(ScanProvidersUnavailableError);
  });

  it('succeeds on the sole provider with no fallback configured', async () => {
    const primary = provider('openai', jest.fn().mockResolvedValue(result));

    await expect(
      new ScanAnalyzer({
        primary,
        imageProcessor: {
          process: jest
            .fn()
            .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
        },
      }).analyze({ image: Buffer.from('input'), locale: 'pt-BR', userId: 'u1' }),
    ).resolves.toEqual({ result, provider: 'openai', imageHash: 'p' });
  });

  it('returns a stable error when both providers fail', async () => {
    const primary = provider('gemini', jest.fn().mockRejectedValue(new Error('one')));
    const fallback = provider('openai', jest.fn().mockRejectedValue(new Error('two')));

    await expect(
      analyzer(primary, fallback).analyze({
        image: Buffer.from('input'),
        locale: 'pt-BR',
        userId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ScanProvidersUnavailableError);
  });

  it('does not extend an open circuit and permits only one half-open probe', async () => {
    let now = 0;
    let rejectProbe!: (reason: Error) => void;
    const probe = new Promise<ScanResult>((_resolve, reject) => {
      rejectProbe = reject;
    });
    const primary = provider(
      'gemini',
      jest
        .fn<ReturnType<VisionProvider['analyze']>, Parameters<VisionProvider['analyze']>>()
        .mockRejectedValueOnce(new Error('initial failure'))
        .mockImplementationOnce(() => probe)
        .mockResolvedValue(result),
    );
    const fallback = provider('openai', jest.fn().mockResolvedValue(result));
    const scanAnalyzer = new ScanAnalyzer({
      primary,
      fallback,
      imageProcessor: {
        process: jest
          .fn()
          .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
      },
      circuitFailureThreshold: 1,
      circuitOpenMs: 1_000,
      now: () => now,
    });
    const input = {
      image: Buffer.from('input'),
      locale: 'pt-BR',
      userId: 'u1',
    };

    await expect(scanAnalyzer.analyze(input)).resolves.toMatchObject({ provider: 'openai' });
    now = 999;
    await expect(scanAnalyzer.analyze(input)).resolves.toMatchObject({ provider: 'openai' });
    expect(primary.analyze).toHaveBeenCalledTimes(1);

    now = 1_000;
    const halfOpenAttempt = scanAnalyzer.analyze(input);
    await Promise.resolve();
    await expect(scanAnalyzer.analyze(input)).resolves.toMatchObject({ provider: 'openai' });
    expect(primary.analyze).toHaveBeenCalledTimes(2);

    rejectProbe(new Error('probe failure'));
    await expect(halfOpenAttempt).resolves.toMatchObject({ provider: 'openai' });
    now = 1_999;
    await expect(scanAnalyzer.analyze(input)).resolves.toMatchObject({ provider: 'openai' });
    expect(primary.analyze).toHaveBeenCalledTimes(2);

    now = 2_000;
    await expect(scanAnalyzer.analyze(input)).resolves.toMatchObject({ provider: 'gemini' });
    expect(primary.analyze).toHaveBeenCalledTimes(3);
  });

  it('logs only a fingerprint for provider failures', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const secret = `Bearer ${'x'.repeat(80)}`;
    const scanAnalyzer = new ScanAnalyzer({
      primary: provider('gemini', jest.fn().mockRejectedValue(new Error(secret))),
      fallback: provider('openai', jest.fn().mockResolvedValue(result)),
      imageProcessor: {
        process: jest
          .fn()
          .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
      },
      logger,
    });

    await scanAnalyzer.analyze({
      image: Buffer.from('input'),
      locale: 'pt-BR',
      userId: 'u1',
    });

    const output = JSON.stringify(logger.warn.mock.calls);
    expect(output).toContain('errorFingerprint');
    expect(output).not.toContain(secret);
    expect(output).not.toContain('Bearer');
  });

  it('logs provider latency and token usage without scan content', async () => {
    let now = 1_000;
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const primary = provider('gemini', async (_image, _locale, options) => {
      options?.onUsage?.({
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        inputTokens: 812,
        outputTokens: 164,
        reasoningTokens: 0,
      });
      now += 1_882;
      return result;
    });
    const scanAnalyzer = new ScanAnalyzer({
      primary,
      fallback: provider('openai', jest.fn()),
      imageProcessor: {
        process: jest
          .fn()
          .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
      },
      logger,
      now: () => now,
    });

    await scanAnalyzer.analyze({
      image: Buffer.from('input'),
      locale: 'pt-BR',
      userId: 'u1',
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        durationMs: 1_882,
        inputTokens: 812,
        outputTokens: 164,
        reasoningTokens: 0,
      }),
      'Scan provider completed.',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Arroz');
  });

  it('records billed usage when the provider classifies no food', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const primary = provider('gemini', async (_image, _locale, options) => {
      options?.onUsage?.({
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        inputTokens: 600,
        outputTokens: 40,
        reasoningTokens: 0,
      });
      throw new NoFoodDetectedError();
    });
    const scanAnalyzer = new ScanAnalyzer({
      primary,
      fallback: provider('openai', jest.fn()),
      imageProcessor: {
        process: jest
          .fn()
          .mockResolvedValue({ buffer: Buffer.from('processed'), perceptualHash: 'p' }),
      },
      logger,
    });

    await expect(
      scanAnalyzer.analyze({
        image: Buffer.from('input'),
        locale: 'pt-BR',
        userId: 'u1',
      }),
    ).rejects.toBeInstanceOf(NoFoodDetectedError);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        containsFood: false,
        inputTokens: 600,
        outputTokens: 40,
      }),
      'Scan provider classified no food.',
    );
  });
});
