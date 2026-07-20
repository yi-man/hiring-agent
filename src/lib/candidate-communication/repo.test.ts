/** @jest-environment node */

import { Prisma } from '@prisma/client';
import { CandidateActionInProgressError } from '@/lib/candidate-screening/repo';
import {
  CandidateExternalMessageIdentityConflictError,
  prismaCandidateConversationRepository,
} from './repo';

type PrismaMock = {
  candidate: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  candidateConversation: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  candidateScreeningResult: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  jobDescription: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  candidateConversationMessage: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    candidateConversation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    candidateScreeningResult: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    jobDescription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    candidateConversationMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as { prisma: PrismaMock };

const occurredAt = new Date('2026-07-20T08:30:00.000Z');
const createdAt = new Date('2026-07-20T08:30:01.000Z');

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    platform: 'boss-like',
    role: 'candidate',
    content: '你好，还在招聘吗？',
    externalMessageId: 'external-message-1',
    deliveryStatus: 'received',
    browserTrace: null,
    errorMessage: null,
    occurredAt,
    createdAt,
    ...overrides,
  };
}

function conversationRow() {
  return {
    id: 'conversation-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    platform: 'boss-like',
    stage: 'new',
    status: 'active',
    intentLevel: null,
    messageCount: 0,
    lastActiveAt: occurredAt,
    lastCandidateMessageAt: occurredAt,
    lastAgentMessageAt: null,
    nextFollowUpAt: null,
    outcomeResult: null,
    outcomeReason: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function createMessageParams(externalMessageId?: string) {
  return {
    conversationId: 'conversation-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    platform: 'boss-like',
    role: 'candidate' as const,
    content: '你好，还在招聘吗？',
    ...(externalMessageId === undefined ? {} : { externalMessageId }),
    deliveryStatus: 'received' as const,
    occurredAt,
  };
}

describe('prismaCandidateConversationRepository.createMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses the canonical message when the same external message id is replayed', async () => {
    prismaMock.candidateConversationMessage.create
      .mockResolvedValueOnce(messageRow())
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.16.2',
        }),
      );
    prismaMock.candidateConversationMessage.findUnique.mockResolvedValue(messageRow());

    const first = await prismaCandidateConversationRepository.createMessage(
      createMessageParams('external-message-1'),
    );
    const replay = await prismaCandidateConversationRepository.createMessage(
      createMessageParams('external-message-1'),
    );

    expect(first.id).toBe('message-1');
    expect(replay.id).toBe(first.id);
    expect(first.isReplay).toBe(false);
    expect(replay.isReplay).toBe(true);
    expect(prismaMock.candidateConversationMessage.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.candidateConversationMessage.findUnique).toHaveBeenCalledWith({
      where: {
        userId_platform_externalMessageId: {
          userId: 'user-1',
          platform: 'boss-like',
          externalMessageId: 'external-message-1',
        },
      },
    });
  });

  it('creates a new message when the platform did not provide an external id', async () => {
    prismaMock.candidateConversationMessage.create.mockResolvedValue(
      messageRow({ id: 'message-without-external-id', externalMessageId: null }),
    );

    const result = await prismaCandidateConversationRepository.createMessage(createMessageParams());

    expect(result.id).toBe('message-without-external-id');
    expect(prismaMock.candidateConversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalMessageId: null,
      }),
    });
    expect(result.isReplay).toBe(false);
    expect(prismaMock.candidateConversationMessage.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when an external id points at a different candidate message', async () => {
    prismaMock.candidateConversationMessage.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.16.2',
      }),
    );
    prismaMock.candidateConversationMessage.findUnique.mockResolvedValueOnce(
      messageRow({ candidateId: 'candidate-2', conversationId: 'conversation-2' }),
    );

    await expect(
      prismaCandidateConversationRepository.createMessage(
        createMessageParams('external-message-1'),
      ),
    ).rejects.toBeInstanceOf(CandidateExternalMessageIdentityConflictError);
  });
});

describe('prismaCandidateConversationRepository.listRecentMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the stable occurrence tuple and returns chronological order', async () => {
    prismaMock.candidateConversationMessage.findMany.mockResolvedValueOnce([
      messageRow({ id: 'message-b' }),
      messageRow({ id: 'message-a' }),
    ]);

    await expect(
      prismaCandidateConversationRepository.listRecentMessages({
        conversationId: 'conversation-1',
        limit: 20,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'message-a' }),
      expect.objectContaining({ id: 'message-b' }),
    ]);

    expect(prismaMock.candidateConversationMessage.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conversation-1' },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  });
});

describe('prismaCandidateConversationRepository processing lease CAS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completes processing only for the current owner with an unexpired lease', async () => {
    prismaMock.candidateConversationMessage.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      prismaCandidateConversationRepository.completeIncomingMessageProcessing({
        userId: 'user-1',
        messageId: 'message-1',
        claimId: 'claim-1',
        outcome: 'processed_ackable',
      }),
    ).resolves.toBe(true);

    expect(prismaMock.candidateConversationMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'message-1',
        userId: 'user-1',
        processingClaimId: 'claim-1',
        processingLeaseExpiresAt: { gt: expect.any(Date) },
        processingOutcome: 'in_flight',
        processedAt: null,
      },
      data: {
        processingClaimId: null,
        processingLeaseExpiresAt: null,
        processingOutcome: 'processed_ackable',
        processedAt: expect.any(Date),
        errorMessage: null,
      },
    });
  });

  it('fails renewal after the claim is lost or expires', async () => {
    prismaMock.candidateConversationMessage.updateMany.mockResolvedValueOnce({ count: 0 });
    const now = new Date('2026-07-20T09:00:00.000Z');

    await expect(
      prismaCandidateConversationRepository.renewIncomingMessageProcessing({
        userId: 'user-1',
        messageId: 'message-1',
        claimId: 'old-claim',
        now,
      }),
    ).resolves.toBe(false);

    expect(prismaMock.candidateConversationMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'message-1',
        userId: 'user-1',
        processingClaimId: 'old-claim',
        processingLeaseExpiresAt: { gt: now },
        processingOutcome: 'in_flight',
        processedAt: null,
      },
      data: { processingLeaseExpiresAt: expect.any(Date) },
    });
  });
});

describe('prismaCandidateConversationRepository decision output recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createRecoveryTransaction(
    outputMessage: ReturnType<typeof messageRow> | null,
    options: {
      finalizedAt?: Date | null;
      action?: { id: string; status: string; errorMessage: string | null } | null;
    } = {},
  ) {
    const decision = {
      id: 'decision-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      inputMessageId: 'message-1',
      outputMessageId: 'output-message-1',
      intent: 'greeting',
      intentLevel: 'medium',
      nextStage: 'contact_requested',
      shouldReply: true,
      reply: '还在招聘，方便继续聊聊吗？',
      actions: ['reply'],
      rationale: 'persisted recovery fixture',
      llmMeta: null,
      finalizedAt: options.finalizedAt ?? null,
      createdAt,
    };
    return {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          platform: 'boss-like',
          role: 'candidate',
          processingClaimId: 'expired-claim',
          processingLeaseExpiresAt: new Date('2026-07-20T08:35:00.000Z'),
          processingOutcome: 'in_flight',
          processedAt: null,
          occurredAt,
          createdAt,
        },
      ]),
      candidateConversationDecision: {
        findFirst: jest.fn().mockResolvedValueOnce(decision),
      },
      candidateActionLog: {
        findUnique: jest.fn().mockResolvedValueOnce(options.action ?? null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      candidateConversationMessage: {
        findUnique: jest.fn().mockResolvedValueOnce(null),
        findFirst: jest.fn().mockResolvedValueOnce(outputMessage),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  it('uses the decision-linked sent row before deciding whether a reply can resume', async () => {
    const outputMessage = messageRow({
      id: 'output-message-1',
      role: 'agent',
      content: '还在招聘，方便继续聊聊吗？',
      externalMessageId: null,
      deliveryStatus: 'sent',
    });
    const tx = createRecoveryTransaction(outputMessage);
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      prismaCandidateConversationRepository.claimIncomingMessageProcessing({
        userId: 'user-1',
        messageId: 'message-1',
        now: new Date('2026-07-20T08:40:00.000Z'),
      }),
    ).resolves.toMatchObject({
      status: 'resume_finalization',
      outgoingMessage: { id: 'output-message-1', deliveryStatus: 'sent' },
      completionOutcome: 'processed_ackable',
    });

    expect(tx.candidateConversationMessage.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'output-message-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        role: 'agent',
      },
    });
  });

  it('does not resume sending when the decision-linked output row is missing', async () => {
    const tx = createRecoveryTransaction(null);
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      prismaCandidateConversationRepository.claimIncomingMessageProcessing({
        userId: 'user-1',
        messageId: 'message-1',
        now: new Date('2026-07-20T08:40:00.000Z'),
      }),
    ).resolves.toMatchObject({
      status: 'resume_finalization',
      outgoingMessage: null,
      completionOutcome: 'delivery_unknown',
    });
  });

  it.each([
    {
      label: 'planned outgoing',
      outputMessage: messageRow({
        id: 'output-message-1',
        role: 'agent',
        externalMessageId: null,
        deliveryStatus: 'planned',
      }),
      action: null,
      cleansOutgoing: true,
      cleansAction: false,
    },
    {
      label: 'planned action',
      outputMessage: messageRow({
        id: 'output-message-1',
        role: 'agent',
        externalMessageId: null,
        deliveryStatus: 'sent',
      }),
      action: { id: 'action-1', status: 'planned', errorMessage: null },
      cleansOutgoing: false,
      cleansAction: true,
    },
    {
      label: 'running action',
      outputMessage: messageRow({
        id: 'output-message-1',
        role: 'agent',
        externalMessageId: null,
        deliveryStatus: 'sent',
      }),
      action: { id: 'action-1', status: 'running', errorMessage: null },
      cleansOutgoing: false,
      cleansAction: true,
    },
    {
      label: 'missing decision-linked output',
      outputMessage: null,
      action: null,
      cleansOutgoing: false,
      cleansAction: false,
    },
  ])('keeps a finalized decision with $label non-ackable', async (fixture) => {
    const tx = createRecoveryTransaction(fixture.outputMessage, {
      finalizedAt: new Date('2026-07-20T08:31:00.000Z'),
      action: fixture.action,
    });
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      prismaCandidateConversationRepository.claimIncomingMessageProcessing({
        userId: 'user-1',
        messageId: 'message-1',
        now: new Date('2026-07-20T08:40:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'processed', outcome: 'delivery_unknown' });

    expect(tx.candidateConversationMessage.updateMany).toHaveBeenCalledWith({
      where: { id: 'message-1', userId: 'user-1' },
      data: expect.objectContaining({
        processingOutcome: 'delivery_unknown',
        errorMessage: expect.stringContaining('发送结果未知'),
      }),
    });
    if (fixture.cleansOutgoing) {
      expect(tx.candidateConversationMessage.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'output-message-1',
          userId: 'user-1',
          deliveryStatus: 'planned',
        },
        data: {
          deliveryStatus: 'failed',
          errorMessage: expect.stringContaining('发送结果未知'),
        },
      });
    } else {
      expect(tx.candidateConversationMessage.updateMany.mock.calls).not.toContainEqual([
        expect.objectContaining({
          where: expect.objectContaining({ id: 'output-message-1' }),
        }),
      ]);
    }
    if (fixture.cleansAction) {
      expect(tx.candidateActionLog.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'action-1',
          userId: 'user-1',
          status: { in: ['planned', 'running'] },
        },
        data: {
          status: 'failed',
          errorMessage: expect.stringContaining('发送结果未知'),
        },
      });
    } else {
      expect(tx.candidateActionLog.updateMany).not.toHaveBeenCalled();
    }
  });
});

describe('prismaCandidateConversationRepository.findOrCreateConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses the canonical row when concurrent first-message upserts race', async () => {
    prismaMock.candidateConversation.upsert
      .mockResolvedValueOnce(conversationRow())
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.16.2',
        }),
      );
    prismaMock.candidateConversation.findUnique.mockResolvedValueOnce(conversationRow());
    const params = {
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      lastActiveAt: occurredAt,
    };

    const [first, second] = await Promise.all([
      prismaCandidateConversationRepository.findOrCreateConversation(params),
      prismaCandidateConversationRepository.findOrCreateConversation(params),
    ]);

    expect(first.id).toBe('conversation-1');
    expect(second.id).toBe(first.id);
    expect(prismaMock.candidateConversation.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.candidateConversation.upsert).toHaveBeenCalledWith({
      where: {
        userId_jobDescriptionId_candidateId: {
          userId: 'user-1',
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
        },
      },
      create: expect.objectContaining({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
      }),
      update: {},
    });
    expect(prismaMock.candidateConversation.findUnique).toHaveBeenCalledWith({
      where: {
        userId_jobDescriptionId_candidateId: {
          userId: 'user-1',
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
        },
      },
    });
  });

  it('rethrows a unique conflict when no canonical conversation exists in scope', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.16.2',
    });
    prismaMock.candidateConversation.upsert.mockRejectedValueOnce(conflict);
    prismaMock.candidateConversation.findUnique.mockResolvedValueOnce(null);

    await expect(
      prismaCandidateConversationRepository.findOrCreateConversation({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        lastActiveAt: occurredAt,
      }),
    ).rejects.toBe(conflict);
  });

  it('rethrows non-unique database errors without a recovery lookup', async () => {
    const databaseError = new Error('database unavailable');
    prismaMock.candidateConversation.upsert.mockRejectedValueOnce(databaseError);

    await expect(
      prismaCandidateConversationRepository.findOrCreateConversation({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        lastActiveAt: occurredAt,
      }),
    ).rejects.toBe(databaseError);

    expect(prismaMock.candidateConversation.findUnique).not.toHaveBeenCalled();
  });
});

describe('prismaCandidateConversationRepository.syncCandidateInterviewStage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('keeps withdrawn mutually exclusive with a running candidate action', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          id: 'screening-result-1',
          interviewStage: 'offer',
        },
      ]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce({ id: 'action-1' }),
      },
      candidateScreeningResult: {
        updateMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValueOnce({ interviewStage: 'offer' }),
        count: jest.fn(),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      prismaCandidateConversationRepository.syncCandidateInterviewStage({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        interviewStage: 'withdrawn',
      }),
    ).rejects.toBeInstanceOf(CandidateActionInProgressError);

    expect(prismaMock.candidateScreeningResult.updateMany).not.toHaveBeenCalled();
    expect(tx.candidateActionLog.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        screeningResultId: 'screening-result-1',
        status: 'running',
      },
      select: { id: true },
    });
    expect(tx.candidateScreeningResult.updateMany).not.toHaveBeenCalled();
  });
});

describe('prismaCandidateConversationRepository.resolveCandidateForPlatformMessage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('resolves a candidate only when the name or company fallback has one match', async () => {
    prismaMock.candidate.findMany.mockResolvedValueOnce([
      {
        id: 'candidate-matched',
        displayName: '张三',
        currentCompany: '示例科技',
      },
      {
        id: 'candidate-other',
        displayName: '李四',
        currentCompany: '其他公司',
      },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveCandidateForPlatformMessage({
        userId: 'user-1',
        platform: 'boss-like',
        candidateName: ' 张 三 ',
      }),
    ).resolves.toEqual({ candidateId: 'candidate-matched' });
  });

  it('fails closed when the name or company fallback matches multiple candidates', async () => {
    prismaMock.candidate.findMany.mockResolvedValueOnce([
      {
        id: 'candidate-by-name',
        displayName: '张三',
        currentCompany: '示例科技',
      },
      {
        id: 'candidate-by-company',
        displayName: '李四',
        currentCompany: '张三',
      },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveCandidateForPlatformMessage({
        userId: 'user-1',
        platform: 'boss-like',
        candidateName: '张三',
      }),
    ).resolves.toBeNull();
  });
});

describe('prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('prefers an exact platform job title over an explicitly selected JD', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-platform-title',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-explicit',
        position: '前端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        fallbackJobDescriptionId: 'jd-explicit',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-platform-title' });

    expect(prismaMock.candidateScreeningResult.findFirst).not.toHaveBeenCalled();
  });

  it('uses an explicitly selected JD to disambiguate duplicate exact titles', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-exact-newer',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-exact-selected',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        fallbackJobDescriptionId: 'jd-exact-selected',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-exact-selected' });
  });

  it('uses the unique candidate relationship when it conflicts with the selected duplicate title', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-exact-selected',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-exact-related',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-exact-related' },
    ]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        fallbackJobDescriptionId: 'jd-exact-selected',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-exact-related' });
  });

  it('fails closed when duplicate exact titles have no reliable disambiguation', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-exact-newer',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-exact-older',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
      {
        id: 'jd-fallback-other-title',
        position: '前端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        fallbackJobDescriptionId: 'jd-fallback-other-title',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toBeNull();

    expect(prismaMock.jobDescription.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when duplicate exact titles have multiple candidate relationships', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-exact-screening',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-exact-conversation',
        position: '后端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-exact-screening' },
    ]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-exact-conversation' },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toBeNull();
  });

  it('prefers an explicitly selected JD over a fuzzy title and recent screening result', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-fuzzy-title',
        position: '高级后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
    ]);
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({ id: 'jd-explicit' });
    prismaMock.candidateScreeningResult.findFirst.mockResolvedValueOnce({
      jobDescriptionId: 'jd-recent-screening',
    });

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        fallbackJobDescriptionId: 'jd-explicit',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-explicit' });

    expect(prismaMock.candidateScreeningResult.findFirst).not.toHaveBeenCalled();
  });

  it('uses the unique candidate relationship to disambiguate multiple fuzzy titles', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-fuzzy-related',
        position: '高级后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-fuzzy-other',
        position: '资深后端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-fuzzy-related' },
    ]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-fuzzy-related' });
  });

  it('fails closed when multiple fuzzy titles have no unique candidate relationship', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      {
        id: 'jd-fuzzy-screening',
        position: '高级后端工程师',
        content: null,
        status: 'published',
        updatedAt: createdAt,
      },
      {
        id: 'jd-fuzzy-conversation',
        position: '资深后端工程师',
        content: null,
        status: 'published',
        updatedAt: occurredAt,
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-fuzzy-screening' },
    ]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-fuzzy-conversation' },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        platformJobTitle: '后端工程师',
      }),
    ).resolves.toBeNull();
  });

  it('uses a candidate relationship only when it identifies one JD', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([]);
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce(null);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-related' },
    ]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-related' },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
        fallbackJobDescriptionId: 'jd-missing',
        platformJobTitle: '不存在的职位',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-related' });
  });

  it('fails closed when the candidate is related to multiple JDs and no message-specific match exists', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-screening' },
    ]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([
      { jobDescriptionId: 'jd-conversation' },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toBeNull();

    expect(prismaMock.jobDescription.findMany).not.toHaveBeenCalled();
  });

  it('uses the only active JD when the candidate has no existing JD relationship', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([{ id: 'jd-only-active' }]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-only-active' });
  });

  it('fails closed when multiple active JDs remain after candidate-specific resolution misses', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      { id: 'jd-active-1' },
      { id: 'jd-active-2' },
    ]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toBeNull();
  });

  it('uses the only JD when there are no candidate relationships or active JDs', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);
    prismaMock.jobDescription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'jd-only' }]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toEqual({ jobDescriptionId: 'jd-only' });
  });

  it('fails closed when multiple inactive JDs remain as the last fallback', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);
    prismaMock.candidateConversation.findMany.mockResolvedValueOnce([]);
    prismaMock.jobDescription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'jd-any-1' }, { id: 'jd-any-2' }]);

    await expect(
      prismaCandidateConversationRepository.resolveJobDescriptionForCandidateMessage?.({
        userId: 'user-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toBeNull();
  });
});
