/** @jest-environment node */

import { runCandidateCommunicationSkill } from './skill-runner';
import type { CandidateConversationRepository } from './repo';
import type { CandidateCommunicationSkillAdapter } from './skill-types';
import type { RawCandidate } from '@/lib/candidate-screening/ingest';

function createAdapter(
  unreadBatches: Array<Array<{ id: string; candidateId: string; content: string }>>,
): CandidateCommunicationSkillAdapter {
  const listUnreadMessages = jest.fn().mockImplementation(
    async () =>
      unreadBatches.shift()?.map((message) => ({
        externalMessageId: message.id,
        platformCandidateId: message.candidateId,
        candidateName: 'Ada Lovelace',
        profileUrl: `http://127.0.0.1:6183/employer/resumes/${message.candidateId}`,
        content: message.content,
        receivedAt: new Date('2026-06-30T12:00:00.000Z'),
      })) ?? [],
  );

  return {
    platform: 'boss-like',
    getBrowserExecutor: jest.fn(),
    loginIfNeeded: jest.fn().mockResolvedValue(undefined),
    listUnreadMessages,
    searchCandidates: jest.fn(),
    enrichCandidate: jest.fn(async (candidate: RawCandidate) => candidate),
    collectCandidate: jest.fn(),
    chatCandidate: jest.fn().mockResolvedValue({ success: true }),
    close: jest.fn().mockResolvedValue(undefined),
  } satisfies CandidateCommunicationSkillAdapter;
}

function createRepo(): CandidateConversationRepository {
  return {
    getSubject: jest.fn(),
    findOrCreateConversation: jest.fn(),
    listRecentMessages: jest.fn(),
    createMessage: jest.fn(),
    updateMessageDelivery: jest.fn(),
    createDecision: jest.fn(),
    updateConversation: jest.fn(),
    createMemory: jest.fn(),
    markCandidateReplied: jest.fn(),
    syncCandidateInterviewStage: jest.fn(),
    resolveCandidateForPlatformMessage: jest
      .fn()
      .mockImplementation(async ({ platformCandidateId }) => ({
        candidateId: `candidate-${platformCandidateId}`,
      })),
    resolveJobDescriptionForCandidateMessage: jest
      .fn()
      .mockResolvedValue({ jobDescriptionId: 'jd-from-screening' }),
  } as unknown as CandidateConversationRepository;
}

describe('candidate communication skill runner', () => {
  it('processes unread batches and stops only after a no-unread pass', async () => {
    const adapter = createAdapter([
      [
        { id: 'msg-1', candidateId: 'boss-cand-1', content: '你好，还在招吗？' },
        { id: 'msg-2', candidateId: 'boss-cand-2', content: '薪资多少？' },
      ],
      [{ id: 'msg-3', candidateId: 'boss-cand-3', content: '加我微信 wxid_123' }],
      [],
    ]);
    const repo = createRepo();
    const handleMessage = jest.fn().mockResolvedValue({ decision: { intent: 'greeting' } });

    const result = await runCandidateCommunicationSkill({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      adapter,
      repo,
      handleMessage,
    });

    expect(result).toEqual({
      status: 'success',
      stoppedReason: 'no_unread_messages',
      processed: 3,
      failed: 0,
      passes: 3,
    });
    expect(adapter.listUnreadMessages).toHaveBeenCalledTimes(3);
    expect(handleMessage).toHaveBeenCalledTimes(3);
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it('collects and ingests a platform candidate when unread resolution misses the local DB', async () => {
    const adapter = createAdapter([
      [{ id: 'msg-1', candidateId: 'boss-cand-1', content: '你好，还在招吗？' }],
      [],
    ]);
    const rawCandidate: RawCandidate = {
      platformCandidateId: 'boss-cand-1',
      profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
      name: 'Ada Lovelace',
      title: '候选人',
      company: 'boss-like',
      resumeText: 'Java PostgreSQL 招聘 SaaS 沟通自动化',
    };
    adapter.collectCandidateFromMessage = jest.fn().mockResolvedValue(rawCandidate);
    const repo = createRepo();
    (repo.resolveCandidateForPlatformMessage as jest.Mock).mockResolvedValueOnce(null);
    (repo.resolveJobDescriptionForCandidateMessage as jest.Mock).mockResolvedValueOnce({
      jobDescriptionId: 'jd-from-fallback',
    });
    const ingestCandidate = jest.fn().mockResolvedValue({
      candidateId: 'candidate-ingested',
      resumeId: 'resume-1',
      identityHash: 'hash-1',
      chunkCount: 1,
    });
    const handleMessage = jest.fn().mockResolvedValue({ decision: { intent: 'greeting' } });

    await runCandidateCommunicationSkill({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      adapter,
      repo,
      handleMessage,
      ingestCandidate,
    });

    expect(adapter.collectCandidateFromMessage).toHaveBeenCalledWith(
      expect.objectContaining({ externalMessageId: 'msg-1' }),
    );
    expect(ingestCandidate).toHaveBeenCalledWith({
      userId: 'user-1',
      sourcePlatform: 'boss-like',
      rawCandidate,
    });
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          jobDescriptionId: 'jd-from-fallback',
          candidateId: 'candidate-ingested',
        }),
      }),
    );
  });

  it('fails closed when JD resolution is ambiguous despite an explicitly selected fallback', async () => {
    const adapter = createAdapter([
      [{ id: 'msg-1', candidateId: 'boss-cand-1', content: '你好，还在招吗？' }],
    ]);
    const repo = createRepo();
    (repo.resolveJobDescriptionForCandidateMessage as jest.Mock).mockResolvedValueOnce(null);
    const handleMessage = jest.fn();

    await expect(
      runCandidateCommunicationSkill({
        userId: 'user-1',
        jobDescriptionId: 'jd-selected',
        platform: 'boss-like',
        adapter,
        repo,
        handleMessage,
      }),
    ).rejects.toThrow('job description not found for unread message: msg-1');

    expect(repo.resolveJobDescriptionForCandidateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackJobDescriptionId: 'jd-selected' }),
    );
    expect(handleMessage).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it('fails instead of stopping when unread messages cannot be drained', async () => {
    const adapter = createAdapter([
      [{ id: 'msg-1', candidateId: 'boss-cand-1', content: '你好' }],
      [{ id: 'msg-1', candidateId: 'boss-cand-1', content: '你好' }],
    ]);
    const repo = createRepo();
    const handleMessage = jest.fn().mockResolvedValue({ decision: { intent: 'greeting' } });

    await expect(
      runCandidateCommunicationSkill({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        adapter,
        repo,
        handleMessage,
        maxPasses: 2,
      }),
    ).rejects.toThrow('unread inbox was not empty after 2 passes');

    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['in-flight replay', false],
    ['delivery failure', false],
    ['completed processing', true],
  ] as const)('acks the platform only for %s when it is ackable', async (_label, ackable) => {
    const adapter = createAdapter([
      [{ id: 'msg-1', candidateId: 'boss-cand-1', content: '你好' }],
      [],
    ]);
    adapter.markUnreadMessageProcessed = jest.fn().mockResolvedValue(undefined);
    const repo = createRepo();
    const handleMessage = jest.fn().mockResolvedValue({
      outgoingMessage: null,
      processingStatus: ackable ? 'processed' : 'in_flight',
      processingOutcome: ackable ? 'processed_ackable' : 'in_flight',
      ackable,
    });

    await runCandidateCommunicationSkill({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      adapter,
      repo,
      handleMessage,
    });

    expect(adapter.markUnreadMessageProcessed).toHaveBeenCalledTimes(ackable ? 1 : 0);
  });

  it.each([
    { label: 'all messages complete', ackableResults: [true, true], expectedAcks: 1 },
    { label: 'one message is unknown', ackableResults: [true, false], expectedAcks: 0 },
  ] as const)(
    'acks one browser thread once only when $label',
    async ({ ackableResults, expectedAcks }) => {
      const adapter = createAdapter([
        [
          { id: 'msg-1', candidateId: 'boss-cand-1', content: '第一条' },
          { id: 'msg-2', candidateId: 'boss-cand-1', content: '第二条' },
        ],
        [],
      ]);
      const listUnreadMessages = adapter.listUnreadMessages.bind(adapter);
      adapter.listUnreadMessages = jest.fn(async () =>
        (await listUnreadMessages()).map((message) => ({
          ...message,
          replyTarget: {
            browserThreadSelector: '[data-thread-id="thread-1"]',
            sourceMessageId: message.externalMessageId,
          },
        })),
      );
      adapter.markUnreadMessageProcessed = jest.fn().mockResolvedValue(undefined);
      const repo = createRepo();
      const handleMessage = jest.fn();
      for (const ackable of ackableResults) {
        handleMessage.mockResolvedValueOnce({
          outgoingMessage: null,
          processingStatus: 'processed',
          processingOutcome: ackable ? 'processed_ackable' : 'delivery_unknown',
          ackable,
        });
      }

      await runCandidateCommunicationSkill({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        adapter,
        repo,
        handleMessage,
      });

      expect(handleMessage).toHaveBeenCalledTimes(2);
      expect(
        handleMessage.mock.calls.map(
          ([call]) =>
            (call as { payload: { message: { content: string } } }).payload.message.content,
        ),
      ).toEqual(['第一条', '第二条']);
      expect(adapter.markUnreadMessageProcessed).toHaveBeenCalledTimes(expectedAcks);
      if (expectedAcks === 1) {
        expect(adapter.markUnreadMessageProcessed).toHaveBeenCalledWith(
          expect.objectContaining({ externalMessageId: 'msg-2' }),
        );
      }
    },
  );

  it('keeps acknowledgement gates isolated across browser threads', async () => {
    const adapter = createAdapter([
      [
        { id: 'msg-1', candidateId: 'boss-cand-1', content: '第一条' },
        { id: 'msg-2', candidateId: 'boss-cand-2', content: '第二条' },
      ],
      [],
    ]);
    const listUnreadMessages = adapter.listUnreadMessages.bind(adapter);
    adapter.listUnreadMessages = jest.fn(async () =>
      (await listUnreadMessages()).map((message) => ({
        ...message,
        replyTarget: {
          browserThreadSelector: `[data-thread-id="thread-${message.platformCandidateId}"]`,
          sourceMessageId: message.externalMessageId,
        },
      })),
    );
    adapter.markUnreadMessageProcessed = jest.fn().mockResolvedValue(undefined);
    const handleMessage = jest
      .fn()
      .mockResolvedValueOnce({
        processingStatus: 'processed',
        processingOutcome: 'processed_ackable',
        ackable: true,
      })
      .mockResolvedValueOnce({
        processingStatus: 'processed',
        processingOutcome: 'delivery_unknown',
        ackable: false,
      });

    await runCandidateCommunicationSkill({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      adapter,
      repo: createRepo(),
      handleMessage,
    });

    expect(adapter.markUnreadMessageProcessed).toHaveBeenCalledTimes(1);
    expect(adapter.markUnreadMessageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ externalMessageId: 'msg-1' }),
    );
  });
});
