import { evaluateCandidateForJd } from './evaluation';
import type { EvaluationSchema } from './types';

const evaluationSchema: EvaluationSchema = {
  skills: ['Java', 'Spring Boot', 'Redis'],
  domainKnowledge: ['高并发'],
  generalAbility: ['owner'],
  risk: ['频繁跳槽'],
};

describe('evaluateCandidateForJd', () => {
  it('uses LLM tags and score components to produce a decision', async () => {
    const result = await evaluateCandidateForJd({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java Spring Boot 高并发',
      candidateName: '王小明',
      runLLM: async () => ({
        tags: {
          skills: ['Java'],
          domainKnowledge: [],
          generalAbility: ['owner'],
          risk: [],
          activity: [],
          custom: [],
        },
        score: { skill: 90, domain: 70, ability: 80, risk: 10, llmBonus: 5 },
        reason: 'Java 和高并发匹配',
      }),
    });

    expect(result.decision.action).toBe('chat');
    expect(result.decision.reason).toBe('Java 和高并发匹配');
    expect(result.tags.skills).toContain('Java');
    expect(result.score).toMatchObject({
      skill: 90,
      domain: 70,
      ability: 80,
      risk: 10,
      llmBonus: 5,
      total: 78,
    });
  });

  it('falls back to rule-based tags when LLM is unavailable', async () => {
    const result = await evaluateCandidateForJd({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java Spring Boot 高并发',
      candidateName: '王小明',
      runLLM: async () => {
        throw new Error('network unavailable');
      },
    });

    expect(result.tags.skills).toEqual(['Java', 'Spring Boot']);
    expect(result.tags.risk).toContain('llm_evaluation_unavailable');
    expect(result.decision.reason).toContain('LLM 评估失败，已使用规则兜底');
    expect(result.score.total).toBe(48);
  });

  it('validates malformed LLM output and records risk', async () => {
    const malformedOutput = {
      tags: { skills: ['Java'] },
      score: { skill: 'high', domain: 70, ability: 80, risk: 0, llmBonus: 5 },
      reason: 'malformed',
    } as unknown as Awaited<
      ReturnType<NonNullable<Parameters<typeof evaluateCandidateForJd>[0]['runLLM']>>
    >;

    const result = await evaluateCandidateForJd({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java Spring Boot 高并发',
      candidateName: '王小明',
      runLLM: async () => malformedOutput,
    });

    expect(result.tags.risk).toContain('llm_evaluation_unavailable');
    expect(result.tags.skills).toEqual(['Java', 'Spring Boot']);
    expect(result.decision.reason).toContain('LLM 评估失败，已使用规则兜底');
  });

  it('rejects out-of-range LLM scores and falls back instead of high-confidence chat', async () => {
    const outOfRangeOutput = {
      tags: {
        skills: ['Java'],
        domainKnowledge: [],
        generalAbility: ['owner'],
        risk: [],
        activity: [],
        custom: [],
      },
      score: { skill: 1000, domain: 100, ability: 100, risk: -999, llmBonus: 1000 },
      reason: 'inflated scores',
    };

    const result = await evaluateCandidateForJd({
      jobTitle: '高级后端工程师',
      evaluationSchema,
      resumeText: 'Java Spring Boot 高并发',
      candidateName: '王小明',
      runLLM: async () => outOfRangeOutput,
    });

    expect(result.tags.risk).toContain('llm_evaluation_unavailable');
    expect(result.score.total).toBe(48);
    expect(result.decision).toMatchObject({ action: 'skip', priority: 'low' });
    expect(result.decision.reason).toContain('LLM 评估失败，已使用规则兜底');
  });
});
