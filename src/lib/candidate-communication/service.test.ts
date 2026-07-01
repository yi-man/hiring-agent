/** @jest-environment node */

import { handleCandidateMessage } from './service';
import type { CandidateConversationRepository } from './repo';

const createdAt = '2026-06-30T12:00:00.000Z';

function createRepo(overrides: Partial<CandidateConversationRepository> = {}) {
  const repo: CandidateConversationRepository = {
    getSubject: jest.fn().mockResolvedValue({
      jobDescription: {
        id: 'jd-1',
        position: '高级后端工程师',
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
        finalScore: 91,
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
      })
      .mockResolvedValueOnce({
        id: 'outgoing-1',
        role: 'agent',
        content: '收到，我稍后加你。',
        deliveryStatus: 'planned',
      }),
    updateMessageDelivery: jest.fn().mockResolvedValue({
      id: 'outgoing-1',
      role: 'agent',
      content: '收到，我稍后加你。',
      deliveryStatus: 'sent',
    }),
    createDecision: jest.fn().mockResolvedValue({
      id: 'decision-1',
      intent: 'contact_shared',
      nextStage: 'contact_exchanged',
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
    resolveCandidateForPlatformMessage: jest.fn().mockResolvedValue({ candidateId: 'candidate-1' }),
    ...overrides,
  } as CandidateConversationRepository;
  return repo;
}

describe('candidate communication service', () => {
  it('persists an inbound message, sends the decided reply, and writes memory at contact exchange', async () => {
    const repo = createRepo();
    const chatCandidate = jest.fn().mockResolvedValue({
      success: true,
      browserTrace: { action: 'chat' },
    });
    const adapter = {
      platform: 'boss-like' as const,
      loginIfNeeded: jest.fn().mockResolvedValue(undefined),
      searchCandidates: jest.fn(),
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
        createAdapter: () => adapter,
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
    expect(repo.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        outcomeResult: 'contact_exchanged',
      }),
    );
    expect(result.conversation.stage).toBe('contact_exchanged');
    expect(result.outgoingMessage?.deliveryStatus).toBe('sent');
  });
});
