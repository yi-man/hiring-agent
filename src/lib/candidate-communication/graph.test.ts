/** @jest-environment node */

import { runCandidateCommunicationGraph } from './graph';
import type { CandidateConversationRepository, CreateDecisionParams } from './repo';
import { buildScreeningPlanFromJd } from '@/lib/candidate-screening/planner';
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
        hiringTarget: 3,
        onboardedCount: 2,
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
    claimIncomingMessageProcessing: jest
      .fn()
      .mockResolvedValue({ status: 'claimed', claimId: 'claim-1' }),
    completeIncomingMessageProcessing: jest.fn().mockResolvedValue(true),
    renewIncomingMessageProcessing: jest.fn().mockResolvedValue(true),
    updateMessageDelivery: jest.fn(),
    createDecision: jest.fn(async (params: CreateDecisionParams) => ({
      id: 'decision-1',
      ...params,
      outputMessageId: params.outputMessageId ?? null,
      llmMeta: params.llmMeta ?? null,
      finalizedAt: null,
      createdAt,
    })),
    updateDecisionOutput: jest.fn().mockResolvedValue({ id: 'decision-1' }),
    finalizeCandidateDecision: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      stage: 'contact_requested',
      status: 'active',
      messageCount: 1,
    }),
    updateConversation: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      stage: 'contact_requested',
      status: 'active',
      messageCount: 1,
    }),
    createMemory: jest.fn(),
    markCandidateReplied: jest.fn().mockResolvedValue(undefined),
    syncCandidateInterviewStage: jest.fn().mockResolvedValue(undefined),
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
    const buildPlan = jest.fn(buildScreeningPlanFromJd);
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
        buildPlan,
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
    expect(buildPlan).toHaveBeenCalledWith(
      expect.objectContaining({ hiringTarget: 3, onboardedCount: 2 }),
    );
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

  it('fences the lease and uses the unique persisted decision for the outbound reply', async () => {
    const incomingMessage = {
      id: 'incoming-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      role: 'candidate' as const,
      content: '你好，还在招吗？',
      externalMessageId: 'msg-1',
      deliveryStatus: 'received' as const,
      browserTrace: null,
      errorMessage: null,
      occurredAt: createdAt,
      createdAt,
    };
    const outgoingMessage = {
      ...incomingMessage,
      id: 'outgoing-1',
      role: 'agent' as const,
      content: '使用已经固化的回复',
      externalMessageId: 'candidate-communication-reply:incoming-1',
      deliveryStatus: 'planned' as const,
    };
    const persistedDecision = {
      id: 'decision-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      inputMessageId: 'incoming-1',
      outputMessageId: null,
      intent: 'greeting' as const,
      intentLevel: 'high' as const,
      nextStage: 'contact_requested' as const,
      shouldReply: true,
      reply: '使用已经固化的回复',
      actions: ['reply'] as const,
      rationale: 'persisted winner',
      llmMeta: null,
      finalizedAt: null,
      createdAt,
    };
    const createMessage = jest
      .fn()
      .mockResolvedValueOnce(incomingMessage)
      .mockResolvedValueOnce(outgoingMessage);
    const renewIncomingMessageProcessing = jest.fn().mockResolvedValue(true);
    const repo = createRepo({
      createMessage,
      renewIncomingMessageProcessing,
      createDecision: jest.fn().mockResolvedValue(persistedDecision),
      updateMessageDelivery: jest
        .fn()
        .mockResolvedValue({ ...outgoingMessage, deliveryStatus: 'sent' }),
    });
    const chatCandidate = jest.fn().mockResolvedValue({ success: true });

    const result = await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: { ...payload(), executeReply: true },
      dependencies: {
        repo,
        evaluateCandidate: jest.fn().mockResolvedValue({ score: { total: 80 } }),
        claimJobDescriptionOutreach: jest.fn().mockResolvedValue(true),
        createAdapter: jest.fn().mockResolvedValue({
          platform: 'boss-like',
          loginIfNeeded: jest.fn(),
          chatCandidate,
          close: jest.fn(),
        }),
        runLLM: jest.fn().mockResolvedValue({
          intent: 'greeting',
          intentLevel: 'medium',
          nextStage: 'contact_requested',
          shouldReply: true,
          reply: '租约过期 worker 的本地回复',
          actions: ['reply'],
          rationale: 'local loser',
        }),
        strictLlm: false,
      },
    });

    expect(result.decision.reply).toBe('使用已经固化的回复');
    expect(createMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ content: '使用已经固化的回复' }),
    );
    expect(chatCandidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: '使用已经固化的回复' }),
    );
    expect(renewIncomingMessageProcessing).toHaveBeenCalledTimes(3);
  });

  it('does not send when a terminal screening result appears after subject loading', async () => {
    const repo = createRepo();
    let terminalResultAppeared = false;
    const claimJobDescriptionOutreach = jest.fn().mockImplementation(async () => {
      expect(terminalResultAppeared).toBe(true);
      return false;
    });
    const createAdapter = jest.fn();
    const runLLM = jest.fn().mockImplementation(async () => {
      terminalResultAppeared = true;
      return {
        intent: 'greeting',
        intentLevel: 'medium',
        nextStage: 'contact_requested',
        shouldReply: true,
        reply: '还在招聘，方便继续聊聊吗？',
        actions: ['reply'],
        rationale: 'candidate asked about the job',
      };
    });

    const result = await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: { ...payload(), executeReply: true },
      dependencies: {
        repo,
        evaluateCandidate: jest.fn().mockResolvedValue({ score: { total: 80 } }),
        claimJobDescriptionOutreach,
        createAdapter,
        runLLM,
        strictLlm: false,
      },
    });

    expect(claimJobDescriptionOutreach).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
    });
    expect(createAdapter).not.toHaveBeenCalled();
    expect(repo.createMessage).toHaveBeenCalledTimes(1);
    expect(result.outgoingMessage).toBeNull();
  });

  it('does not persist a decision or outbound state after losing the lease during LLM work', async () => {
    const repo = createRepo({
      renewIncomingMessageProcessing: jest.fn().mockResolvedValue(false),
    });
    const createAdapter = jest.fn();

    await expect(
      runCandidateCommunicationGraph({
        userId: 'user-1',
        payload: { ...payload(), executeReply: true },
        dependencies: {
          repo,
          evaluateCandidate: jest.fn().mockResolvedValue({ score: { total: 80 } }),
          createAdapter,
          runLLM: jest.fn().mockResolvedValue({
            intent: 'greeting',
            intentLevel: 'medium',
            nextStage: 'contact_requested',
            shouldReply: true,
            reply: '还在招聘',
            actions: ['reply'],
            rationale: 'reply after a slow LLM call',
          }),
          strictLlm: false,
        },
      }),
    ).rejects.toThrow('processing claim was lost');

    expect(repo.createDecision).not.toHaveBeenCalled();
    expect(repo.createMessage).toHaveBeenCalledTimes(1);
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it('uses the canonical stored occurrence time when a replay arrives with a later poll time', async () => {
    const canonicalReceivedAt = new Date(createdAt);
    const replayReceivedAt = new Date('2026-07-02T12:00:00.000Z');
    const repo = createRepo({
      createMessage: jest.fn().mockResolvedValue({
        id: 'incoming-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        role: 'candidate',
        content: '你好，还在招吗？',
        externalMessageId: 'msg-1',
        deliveryStatus: 'received',
        browserTrace: null,
        errorMessage: null,
        occurredAt: canonicalReceivedAt.toISOString(),
        createdAt,
        isReplay: true,
      }),
    });

    await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: {
        ...payload(),
        message: { ...payload().message, receivedAt: replayReceivedAt },
      },
      dependencies: {
        repo,
        evaluateCandidate: jest.fn().mockResolvedValue({ score: { total: 80 } }),
        runLLM: jest.fn().mockResolvedValue({
          intent: 'greeting',
          intentLevel: 'medium',
          nextStage: 'contact_requested',
          shouldReply: false,
          reply: null,
          actions: ['noop'],
          rationale: 'canonical replay time',
        }),
        strictLlm: false,
      },
    });

    expect(repo.markCandidateReplied).toHaveBeenCalledWith({
      userId: 'user-1',
      candidateId: 'candidate-1',
      lastActiveAt: canonicalReceivedAt,
    });
    expect(repo.finalizeCandidateDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewStage: 'replied',
        conversation: expect.objectContaining({
          lastActiveAt: canonicalReceivedAt,
          lastCandidateMessageAt: canonicalReceivedAt,
          nextFollowUpAt: new Date('2026-07-01T12:00:00.000Z'),
        }),
      }),
    );
  });

  it('preserves a missing persisted output link and finalizes it as delivery unknown', async () => {
    const persistedDecision = {
      id: 'decision-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      inputMessageId: 'incoming-1',
      outputMessageId: 'missing-output-1',
      intent: 'greeting' as const,
      intentLevel: 'medium' as const,
      nextStage: 'contact_requested' as const,
      shouldReply: true,
      reply: '还在招聘，方便继续聊聊吗？',
      actions: ['reply'] as const,
      rationale: 'persisted output disappeared',
      llmMeta: null,
      finalizedAt: null,
      createdAt,
    };
    const repo = createRepo({
      claimIncomingMessageProcessing: jest.fn().mockResolvedValue({
        status: 'resume_finalization',
        claimId: 'claim-1',
        decision: persistedDecision,
        outgoingMessage: null,
        completionOutcome: 'delivery_unknown',
      }),
    });
    const runLLM = jest.fn();
    const createAdapter = jest.fn();

    const result = await runCandidateCommunicationGraph({
      userId: 'user-1',
      payload: { ...payload(), executeReply: true },
      dependencies: { repo, runLLM, createAdapter },
    });

    expect(runLLM).not.toHaveBeenCalled();
    expect(createAdapter).not.toHaveBeenCalled();
    expect(repo.updateDecisionOutput).not.toHaveBeenCalled();
    expect(repo.finalizeCandidateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ interviewStage: 'replied' }),
    );
    expect(repo.completeIncomingMessageProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'delivery_unknown',
        errorMessage: expect.stringContaining('发送结果未知'),
      }),
    );
    expect(result).toMatchObject({
      processingStatus: 'processed',
      processingOutcome: 'delivery_unknown',
      ackable: false,
      outgoingMessage: null,
    });
  });

  it.each(['rejected', 'withdrawn'] as const)(
    'does not plan or send an automatic reply when the candidate is %s',
    async (interviewStage) => {
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
          latestResume: null,
          screeningResult: {
            id: 'result-1',
            runId: 'run-1',
            finalScore: 91,
            interviewStage,
          },
        }),
      });
      const createActionLog = jest.fn().mockResolvedValue({
        id: 'action-1',
        status: 'planned',
      });
      const claimActionLog = jest.fn().mockResolvedValue(null);
      const updateActionLog = jest.fn();
      const createAdapter = jest.fn();

      const result = await runCandidateCommunicationGraph({
        userId: 'user-1',
        payload: {
          ...payload(),
          executeReply: true,
        },
        dependencies: {
          repo,
          createActionLog,
          claimActionLog,
          updateActionLog,
          createAdapter,
          runLLM: async () => ({
            intent: 'greeting',
            intentLevel: 'medium',
            nextStage: 'contact_requested',
            shouldReply: true,
            reply: '还在招聘，方便继续聊聊吗？',
            actions: ['reply'],
            rationale: 'continue recruiting conversation',
          }),
          strictLlm: false,
        },
      });

      expect(createActionLog).not.toHaveBeenCalled();
      expect(claimActionLog).not.toHaveBeenCalled();
      expect(updateActionLog).not.toHaveBeenCalled();
      expect(createAdapter).not.toHaveBeenCalled();
      expect(repo.createMessage).toHaveBeenCalledTimes(1);
      expect(result.outgoingMessage).toBeNull();
    },
  );
});
