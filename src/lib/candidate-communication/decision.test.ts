import { decideCandidateCommunication } from './decision';

const baseContext = {
  currentStage: 'new' as const,
  message: '你好，还在招吗？',
  candidate: {
    displayName: 'Ada Lovelace',
    matchScore: 86,
    hasResume: false,
  },
  job: {
    title: '高级后端工程师',
    summary: '负责 Java 微服务和招聘平台核心链路',
    salaryRange: '30-45K',
    highlights: ['AI 招聘产品', '核心团队'],
  },
  history: [],
};

describe('candidate communication decision', () => {
  it('uses a valid LLM decision when provided', async () => {
    const runLLM = jest.fn().mockResolvedValue({
      intent: 'salary_question',
      intentLevel: 'high',
      nextStage: 'contact_requested',
      shouldReply: true,
      reply: '薪资范围是 30-45K。如果你方便的话，我们可以先加微信继续沟通。',
      actions: ['answer_question', 'request_contact'],
      rationale: 'candidate asked salary and is highly matched',
    });

    const decision = await decideCandidateCommunication({
      ...baseContext,
      message: '薪资范围是多少？',
      runLLM,
      strictLlm: true,
    });

    expect(runLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStage: 'new',
        ruleIntent: 'salary_question',
      }),
    );
    expect(decision).toMatchObject({
      intent: 'salary_question',
      intentLevel: 'high',
      nextStage: 'contact_requested',
      actions: ['answer_question', 'request_contact'],
    });
  });

  it('falls back to requesting a resume when LLM is unavailable in non-strict mode', async () => {
    const decision = await decideCandidateCommunication({
      ...baseContext,
      runLLM: async () => {
        throw new Error('LLM unavailable');
      },
      strictLlm: false,
    });

    expect(decision.intent).toBe('greeting');
    expect(decision.nextStage).toBe('waiting_resume');
    expect(decision.actions).toEqual(['reply', 'request_resume']);
    expect(decision.reply).toContain('简历');
  });

  it('turns shared contact information into contact_exchanged without asking again', async () => {
    const decision = await decideCandidateCommunication({
      ...baseContext,
      currentStage: 'contact_requested',
      message: '可以，加我微信 wxid_backend_2026',
      strictLlm: false,
    });

    expect(decision.intent).toBe('contact_shared');
    expect(decision.nextStage).toBe('contact_exchanged');
    expect(decision.actions).toEqual(['reply', 'capture_contact', 'close']);
    expect(decision.reply).toContain('收到');
  });

  it('rethrows LLM errors in strict mode', async () => {
    await expect(
      decideCandidateCommunication({
        ...baseContext,
        runLLM: async () => {
          throw new Error('OPENAI_API_KEY is not configured');
        },
        strictLlm: true,
      }),
    ).rejects.toThrow('OPENAI_API_KEY is not configured');
  });
});
