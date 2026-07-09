import { runCandidateEvaluationLLM, parseCandidateEvaluationOutput } from './llm';
import type { EvaluationSchema } from './types';

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://api.example.com/v1/',
    OPENAI_MODEL: 'gpt-test',
    OPENAI_JSON_MODE: true,
    JD_LLM_TIMEOUT_MS: 1000,
  },
}));

jest.mock('@/lib/llm/openai-chat', () => ({
  invokeLlmChat: jest.fn(),
}));

const mockEnv = jest.requireMock('@/lib/env').env as {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_JSON_MODE: boolean;
  JD_LLM_TIMEOUT_MS: number;
};

const { invokeLlmChat } = jest.requireMock('@/lib/llm/openai-chat') as {
  invokeLlmChat: jest.Mock;
};

const evaluationSchema: EvaluationSchema = {
  skills: ['Java'],
  domainKnowledge: ['高并发'],
  generalAbility: ['owner'],
  risk: ['频繁跳槽'],
};

const validContent = JSON.stringify({
  tags: {
    skills: ['Java'],
    domainKnowledge: ['高并发'],
    generalAbility: ['owner'],
    risk: [],
    activity: [],
    custom: [],
  },
  score: { skill: 90, domain: 70, ability: 80, risk: 10, llmBonus: 5 },
  reason: 'Java 和高并发匹配',
});

describe('runCandidateEvaluationLLM', () => {
  beforeEach(() => {
    invokeLlmChat.mockReset();
    mockEnv.OPENAI_API_KEY = 'test-key';
    mockEnv.OPENAI_BASE_URL = 'https://api.example.com/v1/';
    mockEnv.OPENAI_MODEL = 'gpt-test';
    mockEnv.OPENAI_JSON_MODE = true;
    mockEnv.JD_LLM_TIMEOUT_MS = 1000;
  });

  it('renders the managed prompt, calls the centralized gateway, and parses valid response', async () => {
    invokeLlmChat.mockResolvedValueOnce({
      content: validContent,
      model: 'gpt-test',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    const result = await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java '.repeat(4000),
      candidateName: '王小明',
    });

    expect(invokeLlmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'candidate-screening.evaluation',
        prompt: {
          id: 'candidate-screening.evaluation',
          version: 'candidate-evaluation-zh-rubric-v2',
        },
        temperature: 0.2,
        responseFormat: 'json_object',
      }),
    );
    const request = invokeLlmChat.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(request.messages[0].content).toEqual(expect.stringContaining('不可信'));
    expect(request.messages[0].content).toEqual(expect.stringContaining('resumeText'));
    const userPayload = JSON.parse(request.messages[1].content) as {
      promptVersion?: string;
      scoringVersion?: string;
      resumeText: string;
    };
    expect(userPayload.promptVersion).toBe('candidate-evaluation-zh-rubric-v2');
    expect(userPayload.scoringVersion).toBe('candidate-screening-rubric-v2');
    expect(userPayload.resumeText).toHaveLength(12000);
    expect(result.tags.skills).toEqual(['Java']);
    expect(result.score.skill).toBe(90);
  });

  it('instructs the model with a Chinese evidence-based rubric and output contract', async () => {
    invokeLlmChat.mockResolvedValueOnce({
      content: validContent,
      model: 'gpt-test',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java 高并发',
      candidateName: '王小明',
    });

    const request = invokeLlmChat.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = request.messages[0].content;

    expect(systemPrompt).toEqual(expect.stringContaining('"tags"'));
    expect(systemPrompt).toEqual(expect.stringContaining('"score"'));
    expect(systemPrompt).toEqual(expect.stringContaining('"reason"'));
    expect(systemPrompt).toEqual(expect.stringContaining('评分规约'));
    expect(systemPrompt).toEqual(expect.stringContaining('必须引用简历事实'));
    expect(systemPrompt).toEqual(expect.stringContaining('calibrationProfile'));
    expect(systemPrompt).toEqual(expect.stringContaining('校准锚点'));
    expect(systemPrompt).toEqual(expect.stringContaining('技能匹配'));
    expect(systemPrompt).toEqual(expect.stringContaining('0-100'));
    expect(systemPrompt).toEqual(expect.stringContaining('llmBonus'));
    expect(systemPrompt).toEqual(expect.stringContaining('-5 到 5'));
    expect(systemPrompt).toEqual(expect.stringContaining('risk=0'));
  });

  it('throws when API key is missing', async () => {
    mockEnv.OPENAI_API_KEY = '';

    await expect(
      runCandidateEvaluationLLM({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java',
        candidateName: '王小明',
      }),
    ).rejects.toThrow('OPENAI_API_KEY is not configured');
    expect(invokeLlmChat).not.toHaveBeenCalled();
  });

  it('throws when provider response is not ok or content is empty', async () => {
    invokeLlmChat.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }));

    await expect(
      runCandidateEvaluationLLM({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java',
        candidateName: '王小明',
      }),
    ).rejects.toThrow('rate limited');

    invokeLlmChat.mockResolvedValueOnce({
      content: '',
      model: 'gpt-test',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    await expect(
      runCandidateEvaluationLLM({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java',
        candidateName: '王小明',
      }),
    ).rejects.toThrow('Candidate evaluation returned empty content');
  });

  it('normalizes missing tag arrays and parses the first JSON object from provider content', async () => {
    const partialContent = JSON.stringify({
      tags: {
        skills: ['Java'],
        domainKnowledge: ['高并发'],
        generalAbility: ['owner'],
        risk: [],
      },
      score: { skill: 90, domain: 70, ability: 80, risk: 10, llmBonus: 5 },
      reason: 'Java 和高并发匹配',
    });
    invokeLlmChat.mockResolvedValueOnce({
      content: `${partialContent}\n补充说明：已完成简历评估。`,
      model: 'gpt-test',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    const result = await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java 高并发',
      candidateName: '王小明',
    });

    expect(result.tags).toEqual({
      skills: ['Java'],
      domainKnowledge: ['高并发'],
      generalAbility: ['owner'],
      risk: [],
      activity: [],
      custom: [],
    });
    expect(result.score.skill).toBe(90);
  });

  it('defaults missing optional LLM bonus to zero', () => {
    const result = parseCandidateEvaluationOutput({
      tags: {
        skills: ['Java'],
        domainKnowledge: ['高并发'],
        generalAbility: ['owner'],
        risk: [],
        activity: [],
        custom: [],
      },
      score: { skill: 90, domain: 70, ability: 80, risk: 10 },
      reason: 'Java 和高并发匹配',
    });

    expect(result.score).toEqual({
      skill: 90,
      domain: 70,
      ability: 80,
      risk: 10,
      llmBonus: 0,
    });
  });

  it('validates bad JSON and schema errors', async () => {
    invokeLlmChat.mockResolvedValueOnce({
      content: '{not json',
      model: 'gpt-test',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    await expect(
      runCandidateEvaluationLLM({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java',
        candidateName: '王小明',
      }),
    ).rejects.toThrow();

    expect(() =>
      parseCandidateEvaluationOutput({
        tags: {
          skills: ['Java'],
          domainKnowledge: [],
          generalAbility: [],
          risk: [],
          activity: [],
          custom: [],
        },
        score: { skill: 'high', domain: 70, ability: 80, risk: 10, llmBonus: 5 },
        reason: 'invalid',
      }),
    ).toThrow();

    expect(() =>
      parseCandidateEvaluationOutput({
        tags: {
          skills: ['Java'],
          domainKnowledge: [],
          generalAbility: [],
          risk: [],
          activity: [],
          custom: [],
        },
        score: { skill: 1000, domain: 70, ability: 80, risk: -999, llmBonus: 1000 },
        reason: 'out of range',
      }),
    ).toThrow();
  });
});
