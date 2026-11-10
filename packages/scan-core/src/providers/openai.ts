import OpenAI from 'openai';
import { DEFAULT_OPENAI_SCAN_MODEL, OPENAI_SCAN_MAX_OUTPUT_TOKENS } from '../constants';
import { buildScanPrompt } from '../prompt';
import { SCAN_RESPONSE_JSON_SCHEMA } from '../response-schema';
import type { AnalyzeOptions, ScanResult, VisionProvider } from '../types';
import { validateScanResult } from '../validator';

export interface OpenAiProviderOptions {
  apiKey: string;
  defaultModel?: string;
}

type OpenAiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export function buildOpenAiScanRequest(
  base64: string,
  prompt: string,
  model: string,
  reasoningEffort?: 'medium' | 'high',
  maxOutputTokens = OPENAI_SCAN_MAX_OUTPUT_TOKENS,
) {
  const isReasoningModel = model.startsWith('gpt-5');
  const resolvedReasoningEffort: OpenAiReasoningEffort =
    reasoningEffort ??
    (model === 'gpt-5-nano' ? 'minimal' : model.startsWith('gpt-5.6') ? 'low' : 'medium');
  return {
    model,
    input: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'input_image' as const,
            image_url: `data:image/jpeg;base64,${base64}`,
            detail: isReasoningModel ? ('original' as const) : ('high' as const),
          },
          { type: 'input_text' as const, text: prompt },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema' as const,
        name: 'food_scan',
        strict: true,
        schema: SCAN_RESPONSE_JSON_SCHEMA,
      },
      verbosity: 'low' as const,
    },
    ...(isReasoningModel
      ? { reasoning: { effort: resolvedReasoningEffort } }
      : { temperature: 0.1 }),
    max_output_tokens: maxOutputTokens,
    store: false,
  };
}

export class OpenAiProvider implements VisionProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(options: OpenAiProviderOptions) {
    if (!options.apiKey.trim()) throw new Error('OpenAI API key is required.');
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.defaultModel = options.defaultModel?.trim() || DEFAULT_OPENAI_SCAN_MODEL;
  }

  async analyze(
    imageBuffer: Buffer,
    locale: string,
    options: AnalyzeOptions = {},
  ): Promise<ScanResult> {
    const model = options.model?.trim() || this.defaultModel;
    const response = await this.client.responses.create(
      buildOpenAiScanRequest(
        imageBuffer.toString('base64'),
        options.promptOverride ?? buildScanPrompt(locale),
        model,
        options.reasoningEffort,
        options.maxOutputTokens,
      ),
      { timeout: options.timeoutMs, maxRetries: 0 },
    );

    options.onUsage?.({
      provider: this.name,
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens ?? 0,
    });

    const json = response.output_text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return validateScanResult(JSON.parse(json) as ScanResult);
  }
}
