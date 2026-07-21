/** @jest-environment node */

import { handleCandidateMessage } from './service';
import type {
  CandidateConversationMessageDto,
  CandidateConversationRepository,
  CreateDecisionParams,
  CreateMessageParams,
} from './repo';

const receivedAt = new Date('2026-07-20T09:00:00.000Z');
const timestamp = receivedAt.toISOString();

function message(
  role: 'candidate' | 'agent',
  overrides: Partial<CandidateConversationMessageDto> = {},
): CandidateConversationMessageDto {
  return {
    id: role === 'candidate' ? 'incoming-canonical' : 'outgoing-1',
    conversationId: 'conversation-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    platform: 'boss-like',
    role,
    content: role === 'candidate' ? '你好，还在招聘吗？' : '还在招聘，方便继续聊聊吗？',
    externalMessageId: role === 'candidate' ? 'external-message-1' : null,
    deliveryStatus: role === 'candidate' ? 'received' : 'planned',
    browserTrace: null,
    errorMessage: null,
    occurredAt: timestamp,
    createdAt: timestamp,
    ...overrides,
  };
}

function createRepository(options: { inboundAlreadyPersisted?: boolean } = {}) {
  const incoming = message('candidate');
  const outgoing = message('agent');
  let inboundAttempts = options.inboundAlreadyPersisted ? 1 : 0;
  let processingState: 'received' | 'processing' | 'processed' = 'received';
  let activeClaimId: string | null = null;
  let completedOutcome: 'processed_ackable' | 'delivery_failed' | 'delivery_unknown' =
    'processed_ackable';
  const createMessage = jest.fn(async (params: CreateMessageParams) => {
    if (params.role === 'agent') return outgoing;
    inboundAttempts += 1;
    return { ...incoming, isReplay: inboundAttempts > 1 };
  });
  const claimIncomingMessageProcessing = jest.fn(async () => {
    if (processingState === 'processed') {
      return { status: 'processed' as const, outcome: completedOutcome };
    }
    if (processingState === 'processing') return { status: 'in_flight' as const };
    processingState = 'processing';
    activeClaimId = 'claim-1';
    return { status: 'claimed' as const, claimId: activeClaimId };
  });
  const completeIncomingMessageProcessing = jest.fn(
    async ({ claimId, outcome }: { claimId: string; outcome: typeof completedOutcome }) => {
      if (processingState !== 'processing' || claimId !== activeClaimId) return false;
      processingState = 'processed';
      completedOutcome = outcome;
      activeClaimId = null;
      return true;
    },
  );

  const repo = {
    getSubject: jest.fn().mockResolvedValue({
      jobDescription: {
        id: 'jd-1',
        userId: 'user-1',
        department: '技术部',
        position: '高级后端工程师',
        positionDescription: '负责招聘平台核心链路',
        salaryRange: null,
        workLocations: null,
        hiringTarget: 2,
        onboardedCount: 0,
        tone: 'tech',
        status: 'published',
        content: { title: '高级后端工程师' },
        evaluation: null,
        generationMeta: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      candidate: {
        id: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.test/candidates/1',
        sourcePlatform: 'boss-like',
      },
      latestResume: null,
      screeningResult: null,
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
      messageCount: 1,
      lastActiveAt: timestamp,
      lastCandidateMessageAt: timestamp,
      lastAgentMessageAt: null,
      nextFollowUpAt: null,
      outcomeResult: null,
      outcomeReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    listRecentMessages: jest.fn().mockResolvedValue([]),
    createMessage,
    claimIncomingMessageProcessing,
    completeIncomingMessageProcessing,
    renewIncomingMessageProcessing: jest.fn().mockResolvedValue(true),
    updateMessageDelivery: jest.fn().mockResolvedValue(
      message('agent', {
        deliveryStatus: 'sent',
        browserTrace: { action: 'chat' },
      }),
    ),
    createDecision: jest.fn(async (params: CreateDecisionParams) => ({
      id: 'decision-1',
      ...params,
      outputMessageId: params.outputMessageId ?? null,
      llmMeta: params.llmMeta ?? null,
      finalizedAt: null,
      createdAt: timestamp,
    })),
    updateDecisionOutput: jest.fn().mockResolvedValue({ id: 'decision-1' }),
    finalizeCandidateDecision: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      stage: 'contact_requested',
      status: 'active',
      intentLevel: 'medium',
      messageCount: 3,
      lastActiveAt: timestamp,
      lastCandidateMessageAt: timestamp,
      lastAgentMessageAt: timestamp,
      nextFollowUpAt: null,
      outcomeResult: null,
      outcomeReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    updateConversation: jest.fn().mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      stage: 'contact_requested',
      status: 'active',
      intentLevel: 'medium',
      messageCount: 3,
      lastActiveAt: timestamp,
      lastCandidateMessageAt: timestamp,
      lastAgentMessageAt: timestamp,
      nextFollowUpAt: null,
      outcomeResult: null,
      outcomeReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    createMemory: jest.fn(),
    markCandidateReplied: jest.fn().mockResolvedValue(undefined),
    syncCandidateInterviewStage: jest.fn().mockResolvedValue(undefined),
    resolveCandidateForPlatformMessage: jest.fn(),
  } as unknown as CandidateConversationRepository;

  return { repo, createMessage };
}

describe('candidate communication replay idempotency', () => {
  it('fails before graph execution when an outbound reply has no stable message id', async () => {
    await expect(
      handleCandidateMessage({
        userId: 'user-1',
        payload: {
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          platform: 'boss-like',
          message: {
            content: '你好，还在招聘吗？',
            externalMessageId: null,
            receivedAt,
          },
          executeReply: true,
        },
      }),
    ).rejects.toThrow('external message id is required');
  });

  it('sends only once when the same external message is delivered twice', async () => {
    const { repo, createMessage } = createRepository();
    const claimJobDescriptionOutreach = jest.fn().mockResolvedValue(true);
    const chatCandidate = jest.fn().mockResolvedValue({
      success: true,
      browserTrace: { action: 'chat' },
    });
    const createAdapter = jest.fn().mockResolvedValue({
      platform: 'boss-like',
      loginIfNeeded: jest.fn().mockResolvedValue(undefined),
      chatCandidate,
      close: jest.fn().mockResolvedValue(undefined),
    });
    const runLLM = jest.fn().mockResolvedValue({
      intent: 'greeting' as const,
      intentLevel: 'medium' as const,
      nextStage: 'contact_requested' as const,
      shouldReply: true,
      reply: '还在招聘，方便继续聊聊吗？',
      actions: ['reply'] as const,
      rationale: 'continue recruiting conversation',
    });
    const payload = {
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like' as const,
      message: {
        content: '你好，还在招聘吗？',
        externalMessageId: 'external-message-1',
        receivedAt,
      },
      executeReply: true,
    };
    const dependencies = {
      repo,
      claimJobDescriptionOutreach,
      createAdapter,
      runLLM,
      strictLlm: false,
    };

    const first = await handleCandidateMessage({ userId: 'user-1', payload, dependencies });
    const replay = await handleCandidateMessage({ userId: 'user-1', payload, dependencies });

    expect(first.incomingMessage.id).toBe('incoming-canonical');
    expect(replay.incomingMessage.id).toBe(first.incomingMessage.id);
    expect(first.outgoingMessage?.deliveryStatus).toBe('sent');
    expect(replay.outgoingMessage).toBeNull();
    expect(chatCandidate).toHaveBeenCalledTimes(1);
    expect(createAdapter).toHaveBeenCalledTimes(1);
    expect(claimJobDescriptionOutreach).toHaveBeenCalledTimes(1);
    expect(runLLM).toHaveBeenCalledTimes(1);
    expect(repo.listRecentMessages).toHaveBeenCalledTimes(1);
    expect(repo.markCandidateReplied).toHaveBeenCalledTimes(1);
    expect(repo.createDecision).toHaveBeenCalledTimes(1);
    expect(repo.finalizeCandidateDecision).toHaveBeenCalledTimes(1);
    expect(replay.decision).toEqual({
      intent: 'unknown',
      intentLevel: 'medium',
      nextStage: 'contact_requested',
      shouldReply: false,
      reply: null,
      actions: ['noop'],
      rationale: 'duplicate external message replay ignored',
    });
    expect(createMessage.mock.calls.filter(([params]) => params.role === 'agent')).toHaveLength(1);
  });

  it('atomically resumes one inbound-only replay and noops competing and completed replays', async () => {
    const { repo, createMessage } = createRepository({ inboundAlreadyPersisted: true });
    const claimJobDescriptionOutreach = jest.fn().mockResolvedValue(true);
    const chatCandidate = jest.fn().mockResolvedValue({ success: true });
    const createAdapter = jest.fn().mockResolvedValue({
      platform: 'boss-like',
      loginIfNeeded: jest.fn().mockResolvedValue(undefined),
      chatCandidate,
      close: jest.fn().mockResolvedValue(undefined),
    });
    const runLLM = jest.fn().mockResolvedValue({
      intent: 'greeting' as const,
      intentLevel: 'medium' as const,
      nextStage: 'contact_requested' as const,
      shouldReply: true,
      reply: '还在招聘，方便继续聊聊吗？',
      actions: ['reply'] as const,
      rationale: 'continue recruiting conversation',
    });
    const payload = {
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like' as const,
      message: {
        content: '你好，还在招聘吗？',
        externalMessageId: 'external-message-1',
        receivedAt,
      },
      executeReply: true,
    };
    const dependencies = {
      repo,
      claimJobDescriptionOutreach,
      createAdapter,
      runLLM,
      strictLlm: false,
    };

    const concurrentResults = await Promise.all([
      handleCandidateMessage({ userId: 'user-1', payload, dependencies }),
      handleCandidateMessage({ userId: 'user-1', payload, dependencies }),
    ]);
    const completedReplay = await handleCandidateMessage({
      userId: 'user-1',
      payload,
      dependencies,
    });

    expect(
      concurrentResults.filter((result) => result.outgoingMessage?.deliveryStatus === 'sent'),
    ).toHaveLength(1);
    expect(
      concurrentResults.filter((result) => result.processingStatus === 'in_flight'),
    ).toHaveLength(1);
    expect(completedReplay.outgoingMessage).toBeNull();
    expect(runLLM).toHaveBeenCalledTimes(1);
    expect(chatCandidate).toHaveBeenCalledTimes(1);
    expect(repo.createDecision).toHaveBeenCalledTimes(1);
    expect(repo.finalizeCandidateDecision).toHaveBeenCalledTimes(1);
    expect(createMessage.mock.calls.filter(([params]) => params.role === 'agent')).toHaveLength(1);
  });
});
