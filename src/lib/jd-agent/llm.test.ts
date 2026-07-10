import { runLLM, shouldUseMockLlm } from '@/lib/jd-agent/llm';

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4o-mini',
  },
}));

jest.mock('@/lib/jd-agent/prompts', () => ({
  JD_GENERATE_PROMPT_ID: 'jd-agent.generate',
  JD_EVALUATE_PROMPT_ID: 'jd-agent.evaluate',
  JD_IMPROVE_PROMPT_ID: 'jd-agent.improve',
  buildGeneratePromptVariables: jest.fn(() => ({ title: 'Engineer' })),
  buildEvaluatePromptVariables: jest.fn(() => ({ jdJson: '{}' })),
  buildImprovePromptVariables: jest.fn(() => ({
    jdJson: '{}',
    extraInstruction: 'make it concise',
  })),
}));

jest.mock('@/lib/prompts/app-registry', () => ({
  renderManagedPrompt: jest.fn(),
}));

jest.mock('@/lib/llm', () => ({
  LLM_PROVIDER_CONFIGURATION_ERROR_CODE: 'LLM_PROVIDER_CONFIGURATION',
  invokeLlmChat: jest.fn(),
}));

const mockEnv = jest.requireMock('@/lib/env').env as {
  JD_LLM_MOCK?: boolean;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
};

const { renderManagedPrompt } = jest.requireMock('@/lib/prompts/app-registry') as {
  renderManagedPrompt: jest.Mock;
};

const { invokeLlmChat } = jest.requireMock('@/lib/llm') as {
  invokeLlmChat: jest.Mock;
};

const validJdJson = JSON.stringify({
  title: 'JD',
  summary: '负责核心系统',
  responsibilities: ['负责服务端开发'],
  requirements: ['熟悉 TypeScript'],
  bonus: [],
  highlights: ['AI 招聘产品'],
});

const validEvaluationJson = JSON.stringify({
  scores: { clarity: 8, completeness: 8, attractiveness: 8, specificity: 8 },
  issues: [],
  evidence: [],
  suggestions: [],
  rewrite_required: false,
});

describe('shouldUseMockLlm', () => {
  let envReplacer: ReturnType<typeof jest.replaceProperty> | null = null;

  afterEach(() => {
    envReplacer?.restore();
    envReplacer = null;
    delete mockEnv.JD_LLM_MOCK;
    mockEnv.OPENAI_API_KEY = 'test-key';
    invokeLlmChat.mockReset();
    renderManagedPrompt.mockReset();
  });

  it('uses mock in test environment', () => {
    expect(shouldUseMockLlm()).toBe(true);
  });

  it('does not use mock outside test environment even when legacy mock flag is set', () => {
    envReplacer = jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'development',
    });
    mockEnv.JD_LLM_MOCK = true;

    expect(shouldUseMockLlm()).toBe(false);
  });

  it('does not use mock outside test environment when api key is missing', () => {
    envReplacer = jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'development',
    });
    mockEnv.OPENAI_API_KEY = '';

    expect(shouldUseMockLlm()).toBe(false);
  });
});

describe('runLLM managed prompt and gateway wiring', () => {
  let envReplacer: ReturnType<typeof jest.replaceProperty> | null = null;

  beforeEach(() => {
    envReplacer = jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'development',
    });
    renderManagedPrompt.mockReset();
    renderManagedPrompt.mockResolvedValue({
      definition: { id: 'jd-agent.generate', version: 'jd_v3.3' },
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      options: { temperature: 0.4, responseFormat: 'json_object' },
    });
    invokeLlmChat.mockReset();
  });

  afterEach(() => {
    envReplacer?.restore();
    envReplacer = null;
    mockEnv.OPENAI_API_KEY = 'test-key';
    delete mockEnv.JD_LLM_MOCK;
  });

  it('lets the centralized gateway own provider configuration errors', async () => {
    mockEnv.OPENAI_API_KEY = '';
    invokeLlmChat.mockRejectedValueOnce(
      Object.assign(new Error('No configured LLM providers in LLM_PROVIDER_ORDER'), {
        code: 'LLM_PROVIDER_CONFIGURATION',
      }),
    );

    await expect(
      runLLM({ stage: 'generate', schema: { title: 'Engineer' } as never }),
    ).rejects.toThrow('No configured LLM providers in LLM_PROVIDER_ORDER');
    expect(invokeLlmChat).toHaveBeenCalled();
  });

  it('does not require OPENAI_API_KEY when another provider is configured in the gateway', async () => {
    mockEnv.OPENAI_API_KEY = '';
    invokeLlmChat.mockResolvedValueOnce({
      content: validJdJson,
      model: 'doubao-model',
      usage: { promptTokens: 11, completionTokens: 13, totalTokens: 24 },
    });

    await expect(
      runLLM({ stage: 'generate', schema: { title: 'Engineer' } as never }),
    ).resolves.toMatchObject({
      model: 'doubao-model',
      output: { title: 'JD' },
    });
    expect(invokeLlmChat).toHaveBeenCalled();
  });

  it('renders the generation prompt and invokes the centralized LLM gateway', async () => {
    invokeLlmChat.mockResolvedValueOnce({
      content: validJdJson,
      model: 'gpt-4o-mini',
      usage: { promptTokens: 11, completionTokens: 13, totalTokens: 24 },
    });

    const result = await runLLM({ stage: 'generate', schema: { title: 'Engineer' } as never });

    expect(renderManagedPrompt).toHaveBeenCalledWith('jd-agent.generate', { title: 'Engineer' });
    expect(invokeLlmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'jd-agent.generate',
        prompt: { id: 'jd-agent.generate', version: 'jd_v3.3' },
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'user' },
        ],
        temperature: 0.4,
        responseFormat: 'json_object',
      }),
    );
    expect(result).toMatchObject({
      model: 'gpt-4o-mini',
      output: { title: 'JD' },
      usage: { totalTokens: 24 },
    });
  });

  it('rethrows centralized gateway errors', async () => {
    const providerError = Object.assign(new Error('rate limit exceeded'), {
      status: 429,
      response: { status: 429, body: { error: { code: 'rate_limit' } } },
    });
    renderManagedPrompt.mockResolvedValueOnce({
      definition: { id: 'jd-agent.evaluate', version: 'jd_v3.3' },
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      options: { temperature: 0.4, responseFormat: 'json_object' },
    });
    invokeLlmChat.mockRejectedValueOnce(providerError);

    await expect(runLLM({ stage: 'evaluate', jd: { title: 'A' } as never })).rejects.toThrow(
      'rate limit exceeded',
    );

    expect(invokeLlmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'jd-agent.evaluate',
        prompt: { id: 'jd-agent.evaluate', version: 'jd_v3.3' },
      }),
    );
  });

  it('parses fenced JSON returned by the gateway', async () => {
    invokeLlmChat.mockResolvedValueOnce({
      content: `\`\`\`json\n${validJdJson}\n\`\`\``,
      model: 'gpt-4o-mini',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    await expect(
      runLLM({ stage: 'generate', schema: { title: 'Engineer' } as never }),
    ).resolves.toMatchObject({
      usage: { totalTokens: 3 },
    });
  });

  it('invokes the improve prompt branch', async () => {
    renderManagedPrompt.mockResolvedValueOnce({
      definition: { id: 'jd-agent.improve', version: 'jd_v3.3' },
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      options: { temperature: 0.4, responseFormat: 'json_object' },
    });
    invokeLlmChat.mockResolvedValueOnce({
      content: validJdJson.replace('"JD"', '"Improved JD"'),
      model: 'gpt-4o-mini',
      usage: { promptTokens: 7, completionTokens: 8, totalTokens: 15 },
    });

    await runLLM({
      stage: 'improve',
      jd: { title: 'Old JD' } as never,
      evaluation: { score: 60 } as never,
      extraInstruction: 'make it concise',
    });

    expect(invokeLlmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'jd-agent.improve',
        prompt: { id: 'jd-agent.improve', version: 'jd_v3.3' },
      }),
    );
  });

  it('invokes the evaluate prompt branch and parses evaluation JSON', async () => {
    renderManagedPrompt.mockResolvedValueOnce({
      definition: { id: 'jd-agent.evaluate', version: 'jd_v3.3' },
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'user' },
      ],
      options: { temperature: 0.4, responseFormat: 'json_object' },
    });
    invokeLlmChat.mockResolvedValueOnce({
      content: validEvaluationJson,
      model: 'gpt-4o-mini',
      usage: { promptTokens: 4, completionTokens: 5, totalTokens: 9 },
    });

    await expect(runLLM({ stage: 'evaluate', jd: { title: 'A' } as never })).resolves.toMatchObject(
      {
        output: {
          scores: { clarity: 8 },
          rewrite_required: false,
        },
        usage: { totalTokens: 9 },
      },
    );
  });
});
