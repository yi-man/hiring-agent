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

const mockEnv = jest.requireMock('@/lib/env').env as {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_JSON_MODE: boolean;
  JD_LLM_TIMEOUT_MS: number;
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
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    mockEnv.OPENAI_API_KEY = 'test-key';
    mockEnv.OPENAI_BASE_URL = 'https://api.example.com/v1/';
    mockEnv.OPENAI_MODEL = 'gpt-test';
    mockEnv.OPENAI_JSON_MODE = true;
    mockEnv.JD_LLM_TIMEOUT_MS = 1000;
  });

  it('sends a JSON-mode chat request and parses valid response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: validContent } }] }),
    } as Response);

    const result = await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java '.repeat(4000),
      candidateName: '王小明',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      model: string;
      response_format?: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(request).toMatchObject({
      model: 'gpt-test',
      response_format: { type: 'json_object' },
    });
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(request.messages[0].content).toEqual(expect.stringContaining('untrusted'));
    expect(request.messages[0].content).toEqual(expect.stringContaining('resumeText'));
    const userPayload = JSON.parse(request.messages[1].content) as { resumeText: string };
    expect(userPayload.resumeText).toHaveLength(12000);
    expect(result.tags.skills).toEqual(['Java']);
    expect(result.score.skill).toBe(90);
  });

  it('instructs the model with the exact evaluation output contract and score scale', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: validContent } }] }),
    } as Response);

    await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java 高并发',
      candidateName: '王小明',
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = request.messages[0].content;

    expect(systemPrompt).toEqual(expect.stringContaining('"tags"'));
    expect(systemPrompt).toEqual(expect.stringContaining('"score"'));
    expect(systemPrompt).toEqual(expect.stringContaining('"reason"'));
    expect(systemPrompt).toEqual(expect.stringContaining('0-100'));
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when provider response is not ok or content is empty', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limited' } }),
    } as Response);

    await expect(
      runCandidateEvaluationLLM({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java',
        candidateName: '王小明',
      }),
    ).rejects.toThrow('rate limited');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    } as Response);

    await expect(
      runCandidateEvaluationLLM({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java',
        candidateName: '王小明',
      }),
    ).rejects.toThrow('Candidate evaluation returned empty content');
  });

  it('retries without response_format when JSON mode is unsupported', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'response_format json_object unsupported' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: validContent } }] }),
      } as Response);

    const result = await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java',
      candidateName: '王小明',
    });

    expect(result.tags.skills).toEqual(['Java']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      response_format?: { type: string };
    };
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as {
      response_format?: { type: string };
    };

    expect(firstRequest.response_format).toEqual({ type: 'json_object' });
    expect(secondRequest.response_format).toBeUndefined();
  });

  it('retries without response_format when unsupported JSON mode error body is plain text', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'response_format json_object unsupported',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: validContent } }] }),
      } as Response);

    const result = await runCandidateEvaluationLLM({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java',
      candidateName: '王小明',
    });

    expect(result.tags.skills).toEqual(['Java']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as {
      response_format?: { type: string };
    };
    expect(secondRequest.response_format).toBeUndefined();
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: `${partialContent}\n补充说明：已完成简历评估。` } }],
      }),
    } as Response);

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

  it('validates bad JSON and schema errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{not json' } }] }),
    } as Response);

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
