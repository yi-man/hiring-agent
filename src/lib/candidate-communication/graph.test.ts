/** @jest-environment node */

import { runCandidateCommunicationGraph } from './graph';
import type { CandidateConversationRepository } from './repo';
import type { JobDescriptionDto } from '@/types';

const createdAt = '2026-06-30T12:00:00.000Z';

const jobDescriptionContent: JobDescriptionDto['content'] = {
  title: '高级后端工程师',
  summary: '负责 Java 微服务和招聘平台核心链路',
  responsibilities: ['建设招聘 SaaS 后端'],
  requirements: ['Java', 'PostgreSQL'],
  bonus: ['AI 产品经验'],
  highlights: ['核心团队'],
};

function createRepo(overrides: Partial<CandidateConversationRepository> = {}) {
  const repo: CandidateConversationRepository = {
    getSubject: jest.fn().mockResolvedValue({
      jobDescription: {
        id: 'jd-1',
        userId: 'user-1',
        department: '技术部',
        position: '高级后端工程师',
        positionDescription: '负责招聘平台核心链路',
        tone: 'tech',
        status: 'published',
        content: jobDescriptionContent,
        evaluation: null,
        generationMeta: null,
        createdAt,
        updatedAt: createdAt,
      },
      candidate: {
        id: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
        sourcePlatform: 'boss-like',
      },
      latestResume: {
        id: 'resume-1',
        rawText: 'Java PostgreSQL 招聘 SaaS',
      },
      screeningResult: null,
    }),
    findOrCreateConversation: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      stage: 'new',
      status: 'active',
      intentLevel: null,
      messageCount: 0,
      lastActiveAt: createdAt,
      lastCandidateMessageAt: createdAt,
      lastAgentMessageAt: null,
      nextFollowUpAt: null,
      outcomeResult: null,
      outcomeReason: null,
      createdAt,
      updatedAt: createdAt,
    }),
    listRecentMessages: jest.fn().mockResolvedValue([]),
    createMessage: jest.fn().mockResolvedValue({
      id: 'incoming-1',
      role: 'candidate',
      content: '你好，还在招吗？',
      deliveryStatus: 'received',
      occurredAt: createdAt,
    }),
    updateMessageDelivery: jest.fn(),
    createDecision: jest.fn().mockResolvedValue({
      id: 'decision-1',
      intent: 'greeting',
      nextStage: 'contact_requested',
    }),
    updateConversation: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      stage: 'contact_requested',
      status: 'active',
      messageCount: 1,
    }),
    createMemory: jest.fn(),
    markCandidateReplied: jest.fn().mockResolvedValue(undefined),
    resolveCandidateForPlatformMessage: jest.fn().mockResolvedValue({ candidateId: 'candidate-1' }),
    ...overrides,
  } as CandidateConversationRepository;
  return repo;
}

function payload() {
  return {
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    platform: 'boss-like' as const,
    message: {
      content: '你好，还在招吗？',
      externalMessageId: 'msg-1',
      receivedAt: new Date(createdAt),
    },
    executeReply: false,
  };
}

describe('candidate communication LangGraph', () => {
  it('uses the shared candidate screening resume evaluation before communication decisions', async () => {
    const repo = createRepo();
    const evaluateCandidate = jest.fn().mockResolvedValue({
      tags: {
        skills: ['Java'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      score: { skill: 90, domain: 80, ability: 70, risk: 0, llmBonus: 5, total: 82 },
      decision: { action: 'chat', priority: 'high', reason: 'Java PostgreSQL 匹配' },
    });
    const runLLM = jest.fn().mockResolvedValue({
      intent: 'greeting',
      intentLevel: 'high',
      nextStage: 'contact_requested',
      shouldReply: false,
      reply: null,
      actions: ['noop'],
      rationale: 'candidate has a strong evaluated resume',
    });

    const result = await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: payload(),
      dependencies: {
        repo,
        evaluateCandidate,
        runLLM,
        strictLlm: true,
        strictResumeEvaluation: true,
      },
    });

    expect(evaluateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: '高级后端工程师',
        resumeText: 'Java PostgreSQL 招聘 SaaS',
        candidateName: 'Ada Lovelace',
        strict: true,
      }),
    );
    expect(evaluateCandidate.mock.calls[0][0].evaluationSchema.skills).toEqual([
      'Java',
      'PostgreSQL',
    ]);
    expect(runLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          hasResume: true,
          matchScore: 82,
        }),
      }),
    );
    expect(result.decision.rationale).toBe('candidate has a strong evaluated resume');
  });

  it('defaults shared resume evaluation to non-strict while keeping communication LLM strict', async () => {
    const repo = createRepo();
    const evaluateCandidate = jest.fn().mockResolvedValue({
      tags: {
        skills: ['Java'],
        domainKnowledge: [],
        generalAbility: [],
        risk: ['llm_evaluation_unavailable'],
        activity: [],
        custom: [],
      },
      score: { skill: 65, domain: 50, ability: 50, risk: 30, llmBonus: 0, total: 48 },
      decision: { action: 'skip', priority: 'low', reason: 'LLM 评估失败，已使用规则兜底' },
    });
    const runLLM = jest.fn().mockResolvedValue({
      intent: 'greeting',
      intentLevel: 'medium',
      nextStage: 'waiting_resume',
      shouldReply: false,
      reply: null,
      actions: ['noop'],
      rationale: 'communication LLM remains strict',
    });

    await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: payload(),
      dependencies: {
        repo,
        evaluateCandidate,
        runLLM,
        strictLlm: true,
      },
    });

    expect(evaluateCandidate).toHaveBeenCalledWith(expect.objectContaining({ strict: false }));
  });

  it('reuses existing screening scores instead of evaluating the same resume again', async () => {
    const repo = createRepo({
      getSubject: jest.fn().mockResolvedValue({
        jobDescription: {
          id: 'jd-1',
          userId: 'user-1',
          department: '技术部',
          position: '高级后端工程师',
          positionDescription: '负责招聘平台核心链路',
          tone: 'tech',
          status: 'published',
          content: jobDescriptionContent,
          evaluation: null,
          generationMeta: null,
          createdAt,
          updatedAt: createdAt,
        },
        candidate: {
          id: 'candidate-1',
          displayName: 'Ada Lovelace',
          profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
          sourcePlatform: 'boss-like',
        },
        latestResume: {
          id: 'resume-1',
          rawText: 'Java PostgreSQL 招聘 SaaS',
        },
        screeningResult: {
          finalScore: 91,
        },
      }),
    });
    const evaluateCandidate = jest.fn();
    const runLLM = jest.fn().mockResolvedValue({
      intent: 'greeting',
      intentLevel: 'high',
      nextStage: 'contact_requested',
      shouldReply: false,
      reply: null,
      actions: ['noop'],
      rationale: 'candidate already has a screening score',
    });

    await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: payload(),
      dependencies: {
        repo,
        evaluateCandidate,
        runLLM,
        strictLlm: true,
      },
    });

    expect(evaluateCandidate).not.toHaveBeenCalled();
    expect(runLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          hasResume: true,
          matchScore: 91,
        }),
      }),
    );
  });
});
