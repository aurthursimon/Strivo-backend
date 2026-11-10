import { ServiceUnavailableException } from '@nestjs/common';
import type { Env } from '../../../config';
import type { PrismaService } from '../../../prisma';
import { TrainingService } from '../training.service';
import { GeminiChatClient, GeminiChatError } from '../../support-chat/gemini-chat.client';

const baseEnv = { GEMINI_MODEL: 'gemini-2.5-flash-lite', SUPPORT_CHAT_GEMINI_MODEL: 'gemini-2.5-flash-lite', SUPPORT_CHAT_TIMEOUT_MS: 15000 };
afterEach(() => jest.restoreAllMocks());
it('uses the existing app Gemini configuration when a support-chat key is absent', async () => {
  jest.spyOn(GeminiChatClient.prototype, 'sendMessage').mockResolvedValue('My workout caption');
  const service = new TrainingService({} as PrismaService, { ...baseEnv, GEMINI_API_KEY: 'test-app-key' } as Env);
  await expect(service.story('Finished my workout')).resolves.toEqual({ text: 'My workout caption' });
});
it('accepts a dedicated training key and model without requiring any other AI key', async () => {
  jest.spyOn(GeminiChatClient.prototype, 'sendMessage').mockResolvedValue('Training caption');
  const service = new TrainingService({} as PrismaService, { ...baseEnv, TRAINING_GEMINI_API_KEY: 'test-training-key', TRAINING_GEMINI_MODEL: 'custom-model' } as Env);
  await expect(service.story('Workout')).resolves.toHaveProperty('text', 'Training caption');
});
it('keeps an actionable setup error instead of masking it as a generic provider failure', async () => {
  const service = new TrainingService({} as PrismaService, baseEnv as Env);
  try { await service.story('Workout'); throw new Error('Expected setup rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'TRAINING_AI_NOT_CONFIGURED' });
  }
});
it('preserves provider quota exhaustion as a retryable rate-limit response', async () => {
  jest.spyOn(GeminiChatClient.prototype, 'sendMessage').mockRejectedValue(new GeminiChatError('PROVIDER_ERROR', 'quota', { status: 429 }));
  const service = new TrainingService({} as PrismaService, { ...baseEnv, GEMINI_API_KEY: 'test-app-key' } as Env);
  await expect(service.story('Workout')).rejects.toMatchObject({ status: 429 });
});
