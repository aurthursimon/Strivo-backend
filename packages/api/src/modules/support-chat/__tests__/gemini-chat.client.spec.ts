import { GeminiChatClient, GeminiChatError } from '../gemini-chat.client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('GeminiChatClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('exige uma chave de API nao vazia', () => {
    expect(() => new GeminiChatClient({ apiKey: '', model: 'gemini-2.5-flash-lite', timeoutMs: 1000 })).toThrow(
      'Gemini API key is required.',
    );
  });

  it('envia o prompt de sistema e o historico, e retorna o texto da resposta', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'Resposta do assistente' }] } }] }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new GeminiChatClient({ apiKey: 'key', model: 'gemini-2.5-flash-lite', timeoutMs: 1000 });
    const text = await client.sendMessage('voce e um assistente', [{ role: 'user', text: 'oi' }]);

    expect(text).toBe('Resposta do assistente');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('gemini-2.5-flash-lite:generateContent');
    expect(url).toContain('key=key');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'voce e um assistente' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'oi' }] }]);
  });

  it('transcribes bounded inline audio using the configured model', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'How do I improve my squat?' }] } }] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new GeminiChatClient({ apiKey: 'key', model: 'gemini-2.5-flash-lite', timeoutMs: 1000 });
    await expect(client.transcribeAudio('YXVkaW8=', 'audio/m4a')).resolves.toBe('How do I improve my squat?');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { data: 'YXVkaW8=', mimeType: 'audio/m4a' } });
  });

  it('rejeita com GeminiChatError quando a resposta nao tem texto', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ candidates: [] })) as unknown as typeof fetch;

    const client = new GeminiChatClient({ apiKey: 'key', model: 'gemini-2.5-flash-lite', timeoutMs: 1000 });

    await expect(client.sendMessage('sistema', [])).rejects.toThrow(GeminiChatError);
  });

  it('tenta novamente uma vez em erro 503 e entao sucede', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'overloaded' }, 503))
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok na segunda tentativa' }] } }] }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new GeminiChatClient({ apiKey: 'key', model: 'gemini-2.5-flash-lite', timeoutMs: 1000 });
    const text = await client.sendMessage('sistema', []);

    expect(text).toBe('ok na segunda tentativa');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('nao tenta novamente em erro 400 (requisicao invalida) e propaga imediatamente', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ error: 'bad request' }, 400));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new GeminiChatClient({ apiKey: 'key', model: 'gemini-2.5-flash-lite', timeoutMs: 1000 });

    await expect(client.sendMessage('sistema', [])).rejects.toThrow(GeminiChatError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('converte um timeout em um GeminiChatError com codigo TIMEOUT', async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    }) as unknown as typeof fetch;

    const client = new GeminiChatClient({ apiKey: 'key', model: 'gemini-2.5-flash-lite', timeoutMs: 10 });

    await expect(client.sendMessage('sistema', [])).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
