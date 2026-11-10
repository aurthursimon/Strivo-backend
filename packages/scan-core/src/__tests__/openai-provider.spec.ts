import { DEFAULT_OPENAI_SCAN_MODEL, OPENAI_SCAN_MAX_OUTPUT_TOKENS } from '../constants';
import { buildOpenAiScanRequest } from '../providers/openai';

describe('OpenAI scan provider defaults', () => {
  it('uses the cost-controlled GPT-5 nano fallback defaults', () => {
    const request = buildOpenAiScanRequest(
      'image-base64',
      'scan this meal',
      DEFAULT_OPENAI_SCAN_MODEL,
    );

    expect(request.model).toBe('gpt-5-nano');
    expect(request).toMatchObject({ reasoning: { effort: 'minimal' } });
    expect(request.max_output_tokens).toBe(OPENAI_SCAN_MAX_OUTPUT_TOKENS);
    expect(request.input[0]?.content[0]).toMatchObject({
      type: 'input_image',
      detail: 'original',
    });
    expect(request.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
    });
  });

  it('preserves an explicit reasoning override', () => {
    const request = buildOpenAiScanRequest(
      'image-base64',
      'scan this meal',
      DEFAULT_OPENAI_SCAN_MODEL,
      'high',
      2_048,
    );

    expect(request).toMatchObject({ reasoning: { effort: 'high' } });
    expect(request.max_output_tokens).toBe(2_048);
  });
});
