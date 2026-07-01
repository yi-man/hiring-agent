/**
 * @jest-environment node
 */
import { POST } from '@/app/api/candidate-conversations/messages/route';
import { POST as syncUnread } from '@/app/api/candidate-conversations/sync-unread/route';

const requireAuthMock = jest.fn();
const handleCandidateMessageMock = jest.fn();
const runCandidateCommunicationSkillMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      headers: new Headers(),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

jest.mock('@/lib/candidate-communication/service', () => ({
  handleCandidateMessage: (...args: unknown[]) => handleCandidateMessageMock(...args),
}));

jest.mock('@/lib/candidate-communication/skill-service', () => ({
  runUnreadCandidateCommunicationSkill: (...args: unknown[]) =>
    runCandidateCommunicationSkillMock(...args),
}));

function jsonRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as Request;
}

describe('candidate communication messages route', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    handleCandidateMessageMock.mockReset();
    runCandidateCommunicationSkillMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('ingests a candidate message for the authenticated user', async () => {
    handleCandidateMessageMock.mockResolvedValue({
      conversation: { id: 'conversation-1', stage: 'contact_requested' },
      incomingMessage: { id: 'incoming-1' },
      outgoingMessage: { id: 'outgoing-1', deliveryStatus: 'sent' },
      decision: { intent: 'salary_question', nextStage: 'contact_requested' },
    });

    const res = await POST(
      jsonRequest({
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: { content: '薪资范围是多少？' },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(handleCandidateMessageMock).toHaveBeenCalledWith({
      userId: 'user-1',
      payload: expect.objectContaining({
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        executeReply: true,
      }),
    });
    expect(body.conversation.stage).toBe('contact_requested');
  });

  it('returns 400 for invalid message payloads', async () => {
    const res = await POST(
      jsonRequest({
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: { content: '' },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('message.content is required');
    expect(handleCandidateMessageMock).not.toHaveBeenCalled();
  });

  it('runs the unread-message communication skill', async () => {
    runCandidateCommunicationSkillMock.mockResolvedValue({
      status: 'success',
      stoppedReason: 'no_unread_messages',
      processed: 2,
      failed: 0,
      passes: 2,
    });

    const res = await syncUnread(
      jsonRequest({
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 5,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(runCandidateCommunicationSkillMock).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      maxPasses: 5,
    });
    expect(body.stoppedReason).toBe('no_unread_messages');
  });
});
