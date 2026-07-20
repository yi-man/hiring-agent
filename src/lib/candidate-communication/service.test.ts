/** @jest-environment node */

import { handleCandidateMessage } from './service';
import type { CandidateConversationRepository, CreateDecisionParams } from './repo';
import type { RawCandidate } from '@/lib/candidate-screening/ingest';

const createdAt = '2026-06-30T12:00:00.000Z';

function createRepo(overrides: Partial<CandidateConversationRepository> = {}) {
  const repo: CandidateConversationRepository = {
    getSubject: jest.fn().mockResolvedValue({
      jobDescription: {
        id: 'jd-1',
        position: '高级后端工程师',
        status: 'published',
        content: {
          title: '高级后端工程师',
          summary: '负责 Java 微服务和招聘平台核心链路',
          highlights: ['AI 招聘产品'],
        },
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
        id: 'result-1',
        runId: 'run-1',
        finalScore: 91,
        interviewStage: 'replied',
      },
    }),
    findOrCreateConversation: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      stage: 'contact_requested',
      status: 'active',
      intentLevel: 'medium',
      messageCount: 2,
      lastActiveAt: createdAt,
      lastCandidateMessageAt: createdAt,
      lastAgentMessageAt: createdAt,
      nextFollowUpAt: null,
      outcomeResult: null,
      outcomeReason: null,
      createdAt,
      updatedAt: createdAt,
    }),
    listRecentMessages: jest.fn().mockResolvedValue([]),
    createMessage: jest
      .fn()
      .mockResolvedValueOnce({
        id: 'incoming-1',
        role: 'candidate',
        content: '可以，加我微信 wxid_backend_2026',
        deliveryStatus: 'received',
        occurredAt: createdAt,
        createdAt,
      })
      .mockResolvedValueOnce({
        id: 'outgoing-1',
        role: 'agent',
        content: '收到，我稍后加你。',
        deliveryStatus: 'planned',
        occurredAt: createdAt,
        createdAt,
      }),
    claimIncomingMessageProcessing: jest
      .fn()
      .mockResolvedValue({ status: 'claimed', claimId: 'claim-1' }),
    completeIncomingMessageProcessing: jest.fn().mockResolvedValue(true),
    renewIncomingMessageProcessing: jest.fn().mockResolvedValue(true),
    updateMessageDelivery: jest.fn().mockResolvedValue({
      id: 'outgoing-1',
      role: 'agent',
      content: '收到，我稍后加你。',
      deliveryStatus: 'sent',
    }),
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
      stage: 'contact_exchanged',
      status: 'closed',
      messageCount: 4,
    }),
    updateConversation: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      stage: 'contact_exchanged',
      status: 'closed',
      messageCount: 4,
    }),
    createMemory: jest.fn().mockResolvedValue({
      id: 'memory-1',
      outcomeResult: 'contact_exchanged',
    }),
    markCandidateReplied: jest.fn().mockResolvedValue(undefined),
    syncCandidateInterviewStage: jest.fn().mockResolvedValue(undefined),
    resolveCandidateForPlatformMessage: jest.fn().mockResolvedValue({ candidateId: 'candidate-1' }),
    ...overrides,
  } as CandidateConversationRepository;
  return repo;
}

describe('candidate communication service', () => {
  it('persists an inbound message, sends the decided reply, and writes memory at contact exchange', async () => {
    const repo = createRepo();
    const createActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'planned' });
    const claimActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'running' });
    const updateActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'success' });
    const chatCandidate = jest.fn().mockResolvedValue({
      success: true,
      browserTrace: { action: 'chat' },
    });
    const adapter = {
      platform: 'boss-like' as const,
      getBrowserExecutor: jest.fn(),
      loginIfNeeded: jest.fn().mockResolvedValue(undefined),
      searchCandidates: jest.fn(),
      enrichCandidate: jest.fn(async (candidate: RawCandidate) => candidate),
      collectCandidate: jest.fn(),
      chatCandidate,
      close: jest.fn().mockResolvedValue(undefined),
    };

    const result = await handleCandidateMessage({
      userId: 'user-1',
      payload: {
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: {
          content: '可以，加我微信 wxid_backend_2026',
          externalMessageId: 'msg-1',
          receivedAt: new Date(createdAt),
        },
        executeReply: true,
      },
      dependencies: {
        repo,
        createActionLog,
        claimActionLog,
        updateActionLog,
        createAdapter: async () => adapter,
        runLLM: async () => ({
          intent: 'contact_shared',
          intentLevel: 'high',
          nextStage: 'contact_exchanged',
          shouldReply: true,
          reply: '收到，我稍后加你。',
          actions: ['reply', 'capture_contact', 'close'],
          rationale: 'candidate shared private contact information',
        }),
        strictLlm: false,
      },
    });

    expect(repo.markCandidateReplied).toHaveBeenCalledWith({
      userId: 'user-1',
      candidateId: 'candidate-1',
      lastActiveAt: new Date(createdAt),
    });
    expect(repo.syncCandidateInterviewStage).not.toHaveBeenCalled();
    expect(chatCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
      },
      expect.objectContaining({
        action: 'chat',
        message: expect.stringContaining('收到'),
      }),
    );
    expect(createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        screeningResultId: 'result-1',
        candidateId: 'candidate-1',
        jobDescriptionId: 'jd-1',
        action: 'chat',
        status: 'planned',
        idempotencyKey: 'candidate-communication:incoming-1',
      }),
    );
    expect(claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-1',
      expectedInterviewStage: 'replied',
    });
    expect(updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        id: 'action-1',
        expectedStatus: 'running',
        status: 'success',
      }),
    );
    expect(repo.finalizeCandidateDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewStage: 'replied',
        memory: expect.objectContaining({
          conversationId: 'conversation-1',
          outcomeResult: 'contact_exchanged',
        }),
      }),
    );
    expect(result.conversation.stage).toBe('contact_exchanged');
    expect(result.outgoingMessage?.deliveryStatus).toBe('sent');
  });

  it('does not send an automatic reply when a final hiring outcome wins the action claim', async () => {
    const repo = createRepo({
      getSubject: jest.fn().mockResolvedValue({
        jobDescription: {
          id: 'jd-1',
          position: '高级后端工程师',
          status: 'published',
          content: { title: '高级后端工程师' },
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
          interviewStage: 'offer',
        },
      }),
    });
    const createActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'planned' });
    const claimActionLog = jest.fn().mockResolvedValue(null);
    const updateActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'skipped' });
    const chatCandidate = jest.fn();
    const createAdapter = jest.fn();

    const result = await handleCandidateMessage({
      userId: 'user-1',
      payload: {
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: {
          content: '你好，还在招吗？',
          externalMessageId: 'msg-final-race',
          receivedAt: new Date(createdAt),
        },
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

    expect(claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-1',
      expectedInterviewStage: 'offer',
    });
    expect(updateActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-1',
      expectedStatus: 'planned',
      status: 'skipped',
      errorMessage: 'candidate or job state changed before automatic reply',
    });
    expect(createAdapter).not.toHaveBeenCalled();
    expect(chatCandidate).not.toHaveBeenCalled();
    expect(repo.createMessage).toHaveBeenCalledTimes(1);
    expect(result.outgoingMessage).toBeNull();
  });

  it('short-circuits an already-final candidate before claiming or creating an outgoing message', async () => {
    const repo = createRepo({
      getSubject: jest.fn().mockResolvedValue({
        jobDescription: {
          id: 'jd-1',
          position: '高级后端工程师',
          status: 'published',
          content: { title: '高级后端工程师' },
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
          interviewStage: 'onboarded',
        },
      }),
    });
    const createActionLog = jest.fn();
    const claimActionLog = jest.fn();
    const updateActionLog = jest.fn();
    const createAdapter = jest.fn();

    const result = await handleCandidateMessage({
      userId: 'user-1',
      payload: {
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: {
          content: '入职后还能聊聊吗？',
          externalMessageId: 'msg-already-final',
          receivedAt: new Date(createdAt),
        },
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
          reply: '方便继续聊聊吗？',
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
  });

  it.each(['running', 'success'] as const)(
    'preserves an existing %s action log when a duplicate incoming message loses the claim',
    async (status) => {
      const repo = createRepo();
      const createActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status });
      const claimActionLog = jest.fn().mockResolvedValue(null);
      const updateActionLog = jest.fn();
      const createAdapter = jest.fn();

      const execution = handleCandidateMessage({
        userId: 'user-1',
        payload: {
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          platform: 'boss-like',
          message: {
            content: '可以继续聊聊',
            externalMessageId: 'msg-duplicate',
            receivedAt: new Date(createdAt),
          },
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
            reply: '好的，我们继续沟通。',
            actions: ['reply'],
            rationale: 'continue recruiting conversation',
          }),
          strictLlm: false,
        },
      });

      if (status === 'running') {
        await expect(execution).rejects.toThrow('candidate reply action is already running');
      } else {
        await expect(execution).resolves.toMatchObject({ outgoingMessage: null });
      }
      expect(claimActionLog).toHaveBeenCalledTimes(1);
      expect(updateActionLog).not.toHaveBeenCalled();
      expect(createAdapter).not.toHaveBeenCalled();
      expect(repo.createMessage).toHaveBeenCalledTimes(1);
    },
  );

  it('finalizes the action log before updating delivery after a successful external reply', async () => {
    const repo = createRepo({
      updateMessageDelivery: jest.fn().mockRejectedValue(new Error('message persistence failed')),
    });
    const createActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'planned' });
    const claimActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'running' });
    const updateActionLog = jest.fn().mockResolvedValue({ id: 'action-1', status: 'success' });
    const adapter = {
      platform: 'boss-like' as const,
      getBrowserExecutor: jest.fn(),
      loginIfNeeded: jest.fn().mockResolvedValue(undefined),
      searchCandidates: jest.fn(),
      enrichCandidate: jest.fn(async (candidate: RawCandidate) => candidate),
      collectCandidate: jest.fn(),
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      handleCandidateMessage({
        userId: 'user-1',
        payload: {
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          platform: 'boss-like',
          message: {
            content: '可以继续聊聊',
            externalMessageId: 'msg-delivery-failure',
            receivedAt: new Date(createdAt),
          },
          executeReply: true,
        },
        dependencies: {
          repo,
          createActionLog,
          claimActionLog,
          updateActionLog,
          createAdapter: async () => adapter,
          runLLM: async () => ({
            intent: 'greeting',
            intentLevel: 'medium',
            nextStage: 'contact_requested',
            shouldReply: true,
            reply: '好的，我们继续沟通。',
            actions: ['reply'],
            rationale: 'continue recruiting conversation',
          }),
          strictLlm: false,
        },
      }),
    ).rejects.toThrow('message persistence failed');

    expect(updateActionLog).toHaveBeenCalledTimes(1);
    expect(updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        id: 'action-1',
        expectedStatus: 'running',
        status: 'success',
      }),
    );
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it.each(['offline', 'filled'] as const)(
    'does not auto-reply when the JD is %s even without a screening result',
    async (jobDescriptionStatus) => {
      const repo = createRepo({
        getSubject: jest.fn().mockResolvedValue({
          jobDescription: {
            id: 'jd-1',
            position: '高级后端工程师',
            status: jobDescriptionStatus,
            content: { title: '高级后端工程师' },
          },
          candidate: {
            id: 'candidate-1',
            displayName: 'Ada Lovelace',
            profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
            sourcePlatform: 'boss-like',
          },
          latestResume: null,
          screeningResult: null,
        }),
      });
      const chatCandidate = jest.fn().mockResolvedValue({ success: true });
      const adapter = {
        platform: 'boss-like' as const,
        getBrowserExecutor: jest.fn(),
        loginIfNeeded: jest.fn().mockResolvedValue(undefined),
        searchCandidates: jest.fn(),
        enrichCandidate: jest.fn(async (candidate: RawCandidate) => candidate),
        collectCandidate: jest.fn(),
        chatCandidate,
        close: jest.fn().mockResolvedValue(undefined),
      };
      const createAdapter = jest.fn().mockResolvedValue(adapter);
      const createActionLog = jest.fn();
      const claimActionLog = jest.fn();

      const result = await handleCandidateMessage({
        userId: 'user-1',
        payload: {
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          platform: 'boss-like',
          message: {
            content: '这个岗位还在招聘吗？',
            externalMessageId: `msg-${jobDescriptionStatus}`,
            receivedAt: new Date(createdAt),
          },
          executeReply: true,
        },
        dependencies: {
          repo,
          createAdapter,
          createActionLog,
          claimActionLog,
          runLLM: async () => ({
            intent: 'job_question',
            intentLevel: 'medium',
            nextStage: 'contact_requested',
            shouldReply: true,
            reply: '还在招聘，方便继续聊聊吗？',
            actions: ['reply'],
            rationale: 'candidate asked about the job',
          }),
          strictLlm: false,
        },
      });

      expect(createActionLog).not.toHaveBeenCalled();
      expect(claimActionLog).not.toHaveBeenCalled();
      expect(createAdapter).not.toHaveBeenCalled();
      expect(chatCandidate).not.toHaveBeenCalled();
      expect(repo.createMessage).toHaveBeenCalledTimes(1);
      expect(result.outgoingMessage).toBeNull();
    },
  );

  it('rechecks the JD and candidate under lock before auto-replying without a screening result', async () => {
    const repo = createRepo({
      getSubject: jest.fn().mockResolvedValue({
        jobDescription: {
          id: 'jd-1',
          position: '高级后端工程师',
          status: 'published',
          content: { title: '高级后端工程师' },
        },
        candidate: {
          id: 'candidate-1',
          displayName: 'Ada Lovelace',
          profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
          sourcePlatform: 'boss-like',
        },
        latestResume: null,
        screeningResult: null,
      }),
    });
    const claimJobDescriptionOutreach = jest.fn().mockResolvedValue(false);
    const createAdapter = jest.fn();

    const result = await handleCandidateMessage({
      userId: 'user-1',
      payload: {
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: {
          content: '这个岗位还在招聘吗？',
          externalMessageId: 'msg-offline-race',
          receivedAt: new Date(createdAt),
        },
        executeReply: true,
      },
      dependencies: {
        repo,
        claimJobDescriptionOutreach,
        createAdapter,
        runLLM: async () => ({
          intent: 'job_question',
          intentLevel: 'medium',
          nextStage: 'contact_requested',
          shouldReply: true,
          reply: '还在招聘，方便继续聊聊吗？',
          actions: ['reply'],
          rationale: 'candidate asked about the job',
        }),
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

  it('withdraws the candidate from the interview flow after an explicit rejection', async () => {
    const repo = createRepo();
    const adapter = {
      platform: 'boss-like' as const,
      getBrowserExecutor: jest.fn(),
      loginIfNeeded: jest.fn().mockResolvedValue(undefined),
      searchCandidates: jest.fn(),
      enrichCandidate: jest.fn(async (candidate: RawCandidate) => candidate),
      collectCandidate: jest.fn(),
      chatCandidate: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    await handleCandidateMessage({
      userId: 'user-1',
      payload: {
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: {
          content: '谢谢，暂时不考虑这个机会',
          externalMessageId: 'msg-rejected',
          receivedAt: new Date(createdAt),
        },
        executeReply: false,
      },
      dependencies: {
        repo,
        createAdapter: async () => adapter,
        runLLM: async () => ({
          intent: 'not_interested',
          intentLevel: 'low',
          nextStage: 'rejected',
          shouldReply: true,
          reply: '好的，感谢回复。',
          actions: ['reply', 'mark_rejected', 'close'],
          rationale: 'candidate explicitly declined the opportunity',
        }),
        strictLlm: false,
      },
    });

    expect(repo.syncCandidateInterviewStage).not.toHaveBeenCalled();
    expect(repo.finalizeCandidateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ interviewStage: 'withdrawn' }),
    );
  });
});
