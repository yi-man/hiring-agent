/** @jest-environment node */

import { runCandidateCommunicationSkill } from './skill-runner';
import type { CandidateConversationRepository } from './repo';
import type { CandidateCommunicationSkillAdapter } from './skill-types';

function createAdapter(
  unreadBatches: Array<Array<{ id: string; candidateId: string; content: string }>>,
) {
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
    loginIfNeeded: jest.fn().mockResolvedValue(undefined),
    listUnreadMessages,
    searchCandidates: jest.fn(),
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
    resolveCandidateForPlatformMessage: jest
      .fn()
      .mockImplementation(async ({ platformCandidateId }) => ({
        candidateId: `candidate-${platformCandidateId}`,
      })),
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
});
