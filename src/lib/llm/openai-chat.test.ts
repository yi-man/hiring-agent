import { invokeLlmChat, resetLlmProviderCircuitBreakers } from './openai-chat';

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://llm.example/v1/',
    OPENAI_MODEL: 'test-model',
    OPENAI_JSON_MODE: true,
    JD_LLM_TIMEOUT_MS: 1000,
    LLM_PROVIDER_ORDER: 'openai',
    LLM_MAX_RETRIES: 0,
    LLM_RETRY_BACKOFF_MS: 0,
    LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: 3,
    LLM_CIRCUIT_BREAKER_COOLDOWN_MS: 60000,
    DEEPSEEK_API_KEY: undefined,
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    DEEPSEEK_MODEL: undefined,
    DOUBAO_API_KEY: undefined,
    DOUBAO_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
    DOUBAO_MODEL: undefined,
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
  LLM_PROVIDER_ORDER: string;
  LLM_MAX_RETRIES: number;
  LLM_RETRY_BACKOFF_MS: number;
  LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: number;
  LLM_CIRCUIT_BREAKER_COOLDOWN_MS: number;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL: string;
  DEEPSEEK_MODEL?: string;
  DOUBAO_API_KEY?: string;
  DOUBAO_BASE_URL: string;
  DOUBAO_MODEL?: string;
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
    mockEnv.LLM_PROVIDER_ORDER = 'openai';
    mockEnv.LLM_MAX_RETRIES = 0;
    mockEnv.LLM_RETRY_BACKOFF_MS = 0;
    mockEnv.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
    mockEnv.LLM_CIRCUIT_BREAKER_COOLDOWN_MS = 60000;
    mockEnv.DEEPSEEK_API_KEY = undefined;
    mockEnv.DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
    mockEnv.DEEPSEEK_MODEL = undefined;
    mockEnv.DOUBAO_API_KEY = undefined;
    mockEnv.DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
    mockEnv.DOUBAO_MODEL = undefined;
    recordLlmCallStart.mockClear();
    recordLlmCallEnd.mockClear();
    resetLlmProviderCircuitBreakers();
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
    expect(result.meta.request.payload).toMatchObject({
      messages: [
        { role: 'system', content: '[redacted:6 chars]' },
        { role: 'user', content: '[redacted:4 chars]' },
      ],
    });
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
            messages: [
              { role: 'system', content: '[redacted:6 chars]' },
              { role: 'user', content: '[redacted:4 chars]' },
            ],
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
        responsePayload: expect.objectContaining({
          choices: [{ message: { content: '[redacted:11 chars]' } }],
        }),
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

  it('retries transient provider errors before returning success from the same provider', async () => {
    mockEnv.LLM_MAX_RETRIES = 1;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'upstream overloaded' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'ok after retry' } }],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
      } as Response);

    const result = await invokeLlmChat({
      operation: 'chat.reply',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result).toMatchObject({ content: 'ok after retry', provider: 'openai' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        finalOutcome: 'success',
        httpStatus: 200,
      }),
    );
    expect(recordLlmCallStart).toHaveBeenCalledWith(expect.objectContaining({ retryCount: 1 }));
  });

  it('falls back to the next configured provider after retryable primary provider failure', async () => {
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao';
    mockEnv.LLM_MAX_RETRIES = 0;
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_BASE_URL = 'https://deepseek.example/v1';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_BASE_URL = 'https://doubao.example/api/v3';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'deepseek unavailable' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'doubao result' } }],
            usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
          }),
      } as Response);

    const result = await invokeLlmChat({
      operation: 'jd-agent.generate',
      messages: [{ role: 'user', content: 'write jd' }],
    });

    expect(result).toMatchObject({
      content: 'doubao result',
      provider: 'doubao',
      model: 'doubao-chat',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://deepseek.example/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer deepseek-key' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://doubao.example/api/v3/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer doubao-key' }),
      }),
    );
    expect(recordLlmCallStart).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'doubao',
        model: 'doubao-chat',
        retryCount: 1,
      }),
    );
  });

  it('falls back when the primary provider fails with Bun ConnectionRefused transport errors', async () => {
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,openai';
    mockEnv.LLM_MAX_RETRIES = 0;
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_BASE_URL = 'http://127.0.0.1:9/v1';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';

    fetchMock
      .mockRejectedValueOnce(
        Object.assign(new Error('Unable to connect. Is the computer able to access the url?'), {
          code: 'ConnectionRefused',
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'fallback after transport error' } }],
          }),
      } as Response);

    const result = await invokeLlmChat({
      operation: 'chat.reply',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result).toMatchObject({
      content: 'fallback after transport error',
      provider: 'openai',
    });
    expect(result.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'deepseek',
          outcome: 'error',
          error: 'Unable to connect. Is the computer able to access the url?',
        }),
        expect.objectContaining({
          provider: 'openai',
          outcome: 'success',
        }),
      ]),
    );
  });

  it('opens the provider circuit after repeated retryable failures and skips it until cooldown', async () => {
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao';
    mockEnv.LLM_MAX_RETRIES = 0;
    mockEnv.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 1;
    mockEnv.LLM_CIRCUIT_BREAKER_COOLDOWN_MS = 60000;
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_BASE_URL = 'https://deepseek.example/v1';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_BASE_URL = 'https://doubao.example/api/v3';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'deepseek unavailable' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'first fallback' } }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: 'second fallback' } }] }),
      } as Response);

    await invokeLlmChat({
      operation: 'chat.reply',
      messages: [{ role: 'user', content: 'first' }],
    });
    const second = await invokeLlmChat({
      operation: 'chat.reply',
      messages: [{ role: 'user', content: 'second' }],
    });

    expect(second).toMatchObject({ content: 'second fallback', provider: 'doubao' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe('https://doubao.example/api/v3/chat/completions');
  });
});
