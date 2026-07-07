/**
 * @jest-environment node
 */
import { POST } from '@/app/api/candidate-conversations/messages/route';
import { POST as startCommunicationRun } from '@/app/api/candidate-conversations/runs/route';
import { POST as syncUnread } from '@/app/api/candidate-conversations/sync-unread/route';

const requireAuthMock = jest.fn();
const handleCandidateMessageMock = jest.fn();
const runCandidateCommunicationSkillMock = jest.fn();
const executeSingleCandidateActionMock = jest.fn();
const createCandidateCommunicationRunMock = jest.fn();
const updateCandidateCommunicationRunMock = jest.fn();

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

jest.mock('@/lib/candidate-screening/runner', () => ({
  executeSingleCandidateAction: (...args: unknown[]) => executeSingleCandidateActionMock(...args),
}));

jest.mock('@/lib/candidate-communication/repo', () => ({
  createCandidateCommunicationRun: (...args: unknown[]) =>
    createCandidateCommunicationRunMock(...args),
  updateCandidateCommunicationRun: (...args: unknown[]) =>
    updateCandidateCommunicationRunMock(...args),
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
    executeSingleCandidateActionMock.mockReset();
    createCandidateCommunicationRunMock.mockReset();
    updateCandidateCommunicationRunMock.mockReset();
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

  it('runs the unread-message communication skill without a single JD scope', async () => {
    runCandidateCommunicationSkillMock.mockResolvedValue({
      status: 'success',
      stoppedReason: 'no_unread_messages',
      processed: 6,
      failed: 0,
      passes: 2,
    });

    const res = await syncUnread(
      jsonRequest({
        platform: 'boss-like',
        maxPasses: 5,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(runCandidateCommunicationSkillMock).toHaveBeenCalledWith({
      userId: 'user-1',
      platform: 'boss-like',
      maxPasses: 5,
    });
    expect(body.processed).toBe(6);
  });

  it('creates and finishes a batch communication run', async () => {
    createCandidateCommunicationRunMock.mockResolvedValue({
      id: 'comm-run-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: null,
      platform: 'boss-like',
      mode: 'batch',
      status: 'running',
      stats: null,
      errorMessage: null,
      startedAt: '2026-07-06T01:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-07-06T01:00:00.000Z',
      updatedAt: '2026-07-06T01:00:00.000Z',
    });
    runCandidateCommunicationSkillMock.mockResolvedValue({
      status: 'success',
      stoppedReason: 'no_unread_messages',
      processed: 2,
      failed: 0,
      passes: 3,
    });
    updateCandidateCommunicationRunMock.mockResolvedValue({
      id: 'comm-run-1',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: null,
      platform: 'boss-like',
      mode: 'batch',
      status: 'success',
      stats: { total: 2, selected: 2, processed: 2, failed: 0, passes: 3, records: [] },
      errorMessage: null,
      startedAt: '2026-07-06T01:00:00.000Z',
      finishedAt: '2026-07-06T01:01:00.000Z',
      createdAt: '2026-07-06T01:00:00.000Z',
      updatedAt: '2026-07-06T01:01:00.000Z',
    });

    const res = await startCommunicationRun(
      jsonRequest({
        mode: 'batch',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 5,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(createCandidateCommunicationRunMock).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: null,
      platform: 'boss-like',
      mode: 'batch',
      status: 'running',
      stats: null,
      errorMessage: null,
      startedAt: expect.any(Date),
      finishedAt: null,
    });
    expect(runCandidateCommunicationSkillMock).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      maxPasses: 5,
    });
    expect(updateCandidateCommunicationRunMock).toHaveBeenCalledWith({
      userId: 'user-1',
      runId: 'comm-run-1',
      status: 'success',
      stats: { total: 2, selected: 2, processed: 2, failed: 0, passes: 3, records: [] },
      errorMessage: null,
      finishedAt: expect.any(Date),
    });
    expect(body.run.id).toBe('comm-run-1');
    expect(body.run.stats.processed).toBe(2);
  });

  it('creates a single-candidate communication run', async () => {
    createCandidateCommunicationRunMock.mockResolvedValue({
      id: 'comm-run-single',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      mode: 'single',
      status: 'running',
      stats: null,
      errorMessage: null,
      startedAt: '2026-07-06T01:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-07-06T01:00:00.000Z',
      updatedAt: '2026-07-06T01:00:00.000Z',
    });
    updateCandidateCommunicationRunMock.mockResolvedValue({
      id: 'comm-run-single',
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      mode: 'single',
      status: 'success',
      stats: {
        total: 1,
        selected: 1,
        processed: 1,
        failed: 0,
        records: [
          {
            candidateId: 'candidate-1',
            candidateName: 'Ada Lovelace',
            status: 'success',
            detail: '已发送单点沟通消息',
          },
        ],
      },
      errorMessage: null,
      startedAt: '2026-07-06T01:00:00.000Z',
      finishedAt: '2026-07-06T01:01:00.000Z',
      createdAt: '2026-07-06T01:00:00.000Z',
      updatedAt: '2026-07-06T01:01:00.000Z',
    });
    executeSingleCandidateActionMock.mockResolvedValue({
      status: 'success',
      candidateId: 'candidate-1',
      candidateName: 'Ada Lovelace',
      detail: '已发送单点沟通消息',
    });

    const res = await startCommunicationRun(
      jsonRequest({
        mode: 'single',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        sourceScreeningRunId: 'screening-run-1',
        platform: 'boss-like',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(createCandidateCommunicationRunMock).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      mode: 'single',
      status: 'running',
      stats: null,
      errorMessage: null,
      startedAt: expect.any(Date),
      finishedAt: null,
    });
    expect(runCandidateCommunicationSkillMock).not.toHaveBeenCalled();
    expect(executeSingleCandidateActionMock).toHaveBeenCalledWith({
      userId: 'user-1',
      runId: 'screening-run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
    });
    expect(body.run.mode).toBe('single');
    expect(body.run.stats.records[0].detail).toBe('已发送单点沟通消息');
  });
});
