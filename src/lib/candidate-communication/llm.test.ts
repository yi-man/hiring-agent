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
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('parses the first complete JSON object when the provider appends text', async () => {
    const decision = {
      intent: 'contact_shared',
      intentLevel: 'high',
      nextStage: 'contact_exchanged',
      shouldReply: true,
      reply: '收到，我稍后加你。',
      actions: ['reply', 'capture_contact', 'close'],
      rationale: 'candidate shared private contact information',
    };
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `${JSON.stringify(decision)}\n补充说明：已按招聘沟通规则处理。`,
                },
              },
            ],
          }),
      } as Response);

    await expect(runCandidateCommunicationLLM(baseInput)).resolves.toEqual(decision);
  });
});
