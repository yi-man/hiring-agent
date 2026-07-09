import { runCandidateCommunicationLLM } from './llm';

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://llm.example/v1',
    OPENAI_MODEL: 'test-model',
    OPENAI_JSON_MODE: true,
    JD_LLM_TIMEOUT_MS: 1000,
  },
}));

jest.mock('@/lib/llm/openai-chat', () => ({
  invokeLlmChat: jest.fn(),
}));

const { invokeLlmChat } = jest.requireMock('@/lib/llm/openai-chat') as {
  invokeLlmChat: jest.Mock;
};

const baseInput = {
  currentStage: 'new' as const,
  ruleIntent: 'contact_shared' as const,
  ruleIntentLevel: 'high' as const,
  message: '可以，加我微信 wxid_backend_2026',
  candidate: {
    displayName: 'Ada Lovelace',
    matchScore: 86,
    hasResume: true,
  },
  job: {
    title: '高级后端工程师',
    summary: '负责 Java 微服务和招聘平台核心链路',
    salaryRange: '30-45K',
    highlights: ['AI 招聘产品'],
  },
  history: [],
};

describe('candidate communication LLM runner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    invokeLlmChat.mockReset();
  });

  it('renders the managed prompt, calls the centralized gateway, and parses appended JSON text', async () => {
    const decision = {
      intent: 'contact_shared',
      intentLevel: 'high',
      nextStage: 'contact_exchanged',
      shouldReply: true,
      reply: '收到，我稍后加你。',
      actions: ['reply', 'capture_contact', 'close'],
      rationale: 'candidate shared private contact information',
    };
    invokeLlmChat.mockResolvedValueOnce({
      content: `${JSON.stringify(decision)}\n补充说明：已按招聘沟通规则处理。`,
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    await expect(runCandidateCommunicationLLM(baseInput)).resolves.toEqual(decision);
    expect(invokeLlmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'candidate-communication.decision',
        prompt: {
          id: 'candidate-communication.decision',
          version: 'candidate-communication-decision-v1',
        },
        temperature: 0.2,
        responseFormat: 'json_object',
      }),
    );
    const request = invokeLlmChat.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[0].content).toContain('recruiting communication agent');
    expect(JSON.parse(request.messages[1].content)).toMatchObject({
      currentStage: 'new',
      ruleIntent: 'contact_shared',
      message: '可以，加我微信 wxid_backend_2026',
    });
  });
});
