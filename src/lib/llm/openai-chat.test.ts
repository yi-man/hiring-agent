import { invokeLlmChat } from './openai-chat';

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://llm.example/v1/',
    OPENAI_MODEL: 'test-model',
    OPENAI_JSON_MODE: true,
    JD_LLM_TIMEOUT_MS: 1000,
  },
}));

jest.mock('@/lib/llm-observability/log-service', () => ({
  recordLlmCallStart: jest.fn((ctx) => ctx),
  recordLlmCallEnd: jest.fn().mockResolvedValue(undefined),
}));

const mockEnv = jest.requireMock('@/lib/env').env as {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_JSON_MODE: boolean;
  JD_LLM_TIMEOUT_MS: number;
};

const { recordLlmCallStart, recordLlmCallEnd } = jest.requireMock(
  '@/lib/llm-observability/log-service',
) as {
  recordLlmCallStart: jest.Mock;
  recordLlmCallEnd: jest.Mock;
};

describe('invokeLlmChat', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    mockEnv.OPENAI_API_KEY = 'test-key';
    mockEnv.OPENAI_BASE_URL = 'https://llm.example/v1/';
    mockEnv.OPENAI_MODEL = 'test-model';
    mockEnv.OPENAI_JSON_MODE = true;
    mockEnv.JD_LLM_TIMEOUT_MS = 1000;
    recordLlmCallStart.mockClear();
    recordLlmCallEnd.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('sends one normalized OpenAI-compatible request and records sanitized observability metadata', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 },
        }),
    } as Response);

    const result = await invokeLlmChat({
      operation: 'candidate-screening.evaluation',
      prompt: { id: 'candidate-screening.evaluation', version: 'v2' },
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      temperature: 0.2,
      responseFormat: 'json_object',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      model: 'test-model',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
    });
    expect(result).toMatchObject({
      content: '{"ok":true}',
      model: 'test-model',
      usage: { promptTokens: 7, completionTokens: 5, totalTokens: 12 },
    });
    expect(result.meta.request.headers.Authorization).toBe('Bearer ***');
    expect(recordLlmCallStart).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://llm.example/v1/chat/completions',
        provider: 'openai',
        model: 'test-model',
        requestHeaders: expect.objectContaining({ Authorization: 'Bearer ***' }),
        requestPayload: expect.objectContaining({
          operation: 'candidate-screening.evaluation',
          prompt: { id: 'candidate-screening.evaluation', version: 'v2' },
          providerRequest: expect.objectContaining({
            model: 'test-model',
            response_format: { type: 'json_object' },
          }),
        }),
      }),
    );
    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        httpStatus: 200,
        inputTokens: 7,
        outputTokens: 5,
        totalTokens: 12,
        finalOutcome: 'success',
      }),
    );
  });

  it('retries once without response_format when the provider does not support JSON mode', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'response_format unsupported' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          }),
      } as Response);

    await expect(
      invokeLlmChat({
        operation: 'jd-agent.generate',
        prompt: { id: 'jd-agent.generate', version: 'jd_v3.3' },
        messages: [{ role: 'user', content: 'json please' }],
        temperature: 0.4,
        responseFormat: 'json_object',
      }),
    ).resolves.toMatchObject({ content: '{"ok":true}' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).response_format).toEqual({
      type: 'json_object',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).response_format).toBeUndefined();
    expect(recordLlmCallStart).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 1,
      }),
    );
  });

  it('throws clear configuration errors before sending provider requests', async () => {
    mockEnv.OPENAI_API_KEY = '';

    await expect(
      invokeLlmChat({
        operation: 'chat.reply',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('OPENAI_API_KEY is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordLlmCallStart).not.toHaveBeenCalled();
  });

  it('records provider errors with response payload and status before rethrowing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
    } as Response);

    await expect(
      invokeLlmChat({
        operation: 'chat.reply',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toMatchObject({ message: 'rate limited', status: 429 });

    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        httpStatus: 429,
        responsePayload: { error: { message: 'rate limited' } },
        finalOutcome: 'error',
      }),
    );
  });
});
