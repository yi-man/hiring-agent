import { runLLM, shouldUseMockLlm } from '@/lib/jd-agent/llm';

jest.mock('@/lib/env', () => ({
  env: {
    JD_LLM_MOCK: false,
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4o-mini',
  },
}));

jest.mock('@/lib/jd-agent/prompts', () => ({
  GENERATE_SYSTEM_PROMPT: 'generate-system',
  EVALUATE_SYSTEM_PROMPT: 'evaluate-system',
  IMPROVE_SYSTEM_PROMPT: 'improve-system',
  buildGenerateUserPrompt: jest.fn().mockResolvedValue('generate-user'),
  buildEvaluateUserPrompt: jest.fn().mockResolvedValue('evaluate-user'),
  buildImproveUserPrompt: jest.fn().mockResolvedValue('improve-user'),
}));

jest.mock('@/lib/jd-agent/openai-adapter', () => ({
  openaiGenerateJD: jest.fn(),
  openaiEvaluateJD: jest.fn(),
  openaiImproveJD: jest.fn(),
}));

jest.mock('@/lib/llm-observability/log-service', () => ({
  recordLlmCallStart: jest.fn((ctx) => ctx),
  recordLlmCallEnd: jest.fn().mockResolvedValue(undefined),
}));

const { openaiGenerateJD, openaiEvaluateJD, openaiImproveJD } = jest.requireMock(
  '@/lib/jd-agent/openai-adapter',
) as {
  openaiGenerateJD: jest.Mock;
  openaiEvaluateJD: jest.Mock;
  openaiImproveJD: jest.Mock;
};

const { recordLlmCallStart, recordLlmCallEnd } = jest.requireMock(
  '@/lib/llm-observability/log-service',
) as {
  recordLlmCallStart: jest.Mock;
  recordLlmCallEnd: jest.Mock;
};

describe('shouldUseMockLlm', () => {
  it('uses mock in test environment', () => {
    expect(shouldUseMockLlm()).toBe(true);
  });
});

describe('runLLM observability wiring', () => {
  let envReplacer: ReturnType<typeof jest.replaceProperty> | null = null;

  beforeEach(() => {
    envReplacer = jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'development',
    });
    openaiGenerateJD.mockReset();
    openaiEvaluateJD.mockReset();
    openaiImproveJD.mockReset();
    recordLlmCallStart.mockClear();
    recordLlmCallEnd.mockClear();
  });

  afterEach(() => {
    envReplacer?.restore();
    envReplacer = null;
  });

  it('records call start/end with request and response metadata on success', async () => {
    openaiGenerateJD.mockResolvedValueOnce({
      output: { title: 'JD' },
      usage: { promptTokens: 11, completionTokens: 13, totalTokens: 24 },
      meta: {
        request: {
          url: 'https://api.openai.com/v1/chat/completions',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
          payload: { model: 'gpt-4o-mini' },
        },
        response: {
          status: 200,
          body: { id: 'resp_1', choices: [{ message: { content: '{}' } }] },
        },
      },
    });

    await runLLM({ stage: 'generate', schema: { title: 'Engineer' } as never });

    expect(recordLlmCallStart).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://api.openai.com/v1/chat/completions',
        requestHeaders: expect.objectContaining({ Authorization: 'Bearer ***' }),
        requestPayload: expect.objectContaining({ model: 'gpt-4o-mini' }),
      }),
      expect.objectContaining({
        httpStatus: 200,
        inputTokens: 11,
        outputTokens: 13,
        totalTokens: 24,
      }),
    );
    const startArg = recordLlmCallStart.mock.calls[0][0];
    const endArg = recordLlmCallEnd.mock.calls[0][1];
    expect(startArg.timestamp).toBeInstanceOf(Date);
    expect(endArg.timestamp).toBeInstanceOf(Date);
    expect(endArg.timestamp.getTime()).toBeGreaterThanOrEqual(startArg.timestamp.getTime());
  });

  it('records error with classification inputs and rethrows when provider fails', async () => {
    const providerError = Object.assign(new Error('rate limit exceeded'), {
      status: 429,
      response: { status: 429, body: { error: { code: 'rate_limit' } } },
    });
    openaiEvaluateJD.mockRejectedValueOnce(providerError);

    await expect(runLLM({ stage: 'evaluate', jd: { title: 'A' } as never })).rejects.toThrow(
      'rate limit exceeded',
    );

    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        error: providerError,
        httpStatus: 429,
        responsePayload: { error: { code: 'rate_limit' } },
        finalOutcome: 'error',
      }),
    );
    const endArg = recordLlmCallEnd.mock.calls[0][1];
    expect(endArg.error).toBe(providerError);
  });

  it('does not break business flow when log write fails', async () => {
    recordLlmCallEnd.mockRejectedValueOnce(new Error('log unavailable'));
    openaiGenerateJD.mockResolvedValueOnce({
      output: { title: 'JD' },
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      meta: {
        request: {
          url: 'https://api.openai.com/v1/chat/completions',
          headers: { 'Content-Type': 'application/json' },
          payload: {},
        },
        response: { status: 200, body: {} },
      },
    });

    await expect(
      runLLM({ stage: 'generate', schema: { title: 'Engineer' } as never }),
    ).resolves.toMatchObject({
      usage: { totalTokens: 3 },
    });
  });

  it('records improve branch with full observability path', async () => {
    openaiImproveJD.mockResolvedValueOnce({
      output: { title: 'Improved JD' },
      usage: { promptTokens: 7, completionTokens: 8, totalTokens: 15 },
      meta: {
        request: {
          url: 'https://api.openai.com/v1/chat/completions',
          headers: { 'Content-Type': 'application/json' },
          payload: {},
        },
        response: { status: 200, body: { id: 'resp_improve' } },
      },
    });

    await runLLM({
      stage: 'improve',
      jd: { title: 'Old JD' } as never,
      evaluation: { score: 60 } as never,
      extraInstruction: 'make it concise',
    });

    expect(openaiImproveJD).toHaveBeenCalledTimes(1);
    expect(recordLlmCallStart).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        finalOutcome: 'success',
        totalTokens: 15,
      }),
    );
  });
});
