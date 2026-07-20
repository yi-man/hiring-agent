/** @jest-environment node */

import { GET } from './route';
import {
  getPublishRun,
  listPublishRunEvents,
  reconcileTerminalPublishRunWithRetry,
} from '@/lib/jd-publishing/publish-run-repo';
import { recoverStaleJobDescriptionPublishing } from '@/lib/jd/job-description-repo';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

jest.mock('@/lib/jd-publishing/publish-run-repo', () => ({
  getPublishRun: jest.fn(),
  listPublishRunEvents: jest.fn(),
  reconcileTerminalPublishRunWithRetry: jest.fn(),
}));
jest.mock('@/lib/jd/job-description-repo', () => ({
  recoverStaleJobDescriptionPublishing: jest.fn(),
}));

const getPublishRunMock = getPublishRun as jest.MockedFunction<typeof getPublishRun>;
const listPublishRunEventsMock = listPublishRunEvents as jest.MockedFunction<
  typeof listPublishRunEvents
>;
const reconcileTerminalRunMock = reconcileTerminalPublishRunWithRetry as jest.MockedFunction<
  typeof reconcileTerminalPublishRunWithRetry
>;
const recoverStalePublishingMock = recoverStaleJobDescriptionPublishing as jest.MockedFunction<
  typeof recoverStaleJobDescriptionPublishing
>;

const timestamp = '2026-07-20T12:30:00.000Z';
const successRun = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  batchId: 'batch-1',
  platform: 'boss',
  status: 'success' as const,
  currentStage: 'completed' as const,
  errorMessage: null,
  publishTaskId: 'task-1',
  skillId: 'skill-1',
  startedAt: timestamp,
  finishedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('GET /api/jd/publish-runs/[runId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPublishRunMock.mockResolvedValue(successRun);
    listPublishRunEventsMock.mockResolvedValue([]);
    reconcileTerminalRunMock.mockResolvedValue(true);
    recoverStalePublishingMock.mockResolvedValue(null);
  });

  it('self-heals the JD lifecycle from a successful terminal run while polling', async () => {
    const response = await GET(new Request('http://localhost/api/jd/publish-runs/run-1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.status).toBe('success');
    expect(reconcileTerminalRunMock).toHaveBeenCalledWith(successRun, { maxAttempts: 2 });
  });

  it('does not reconcile a non-terminal run', async () => {
    const runningRun = {
      ...successRun,
      status: 'running',
      currentStage: 'publishing',
      finishedAt: null,
    } as const;
    getPublishRunMock.mockResolvedValueOnce(runningRun).mockResolvedValueOnce(runningRun);

    const response = await GET(new Request('http://localhost/api/jd/publish-runs/run-1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    });

    expect(response.status).toBe(200);
    expect(reconcileTerminalRunMock).not.toHaveBeenCalled();
    expect(recoverStalePublishingMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
    });
  });

  it('returns a run failed by stale publish recovery', async () => {
    const pendingRun = {
      ...successRun,
      status: 'pending' as const,
      currentStage: 'queued' as const,
      publishTaskId: null,
      skillId: null,
      startedAt: null,
      finishedAt: null,
    };
    const failedRun = {
      ...pendingRun,
      status: 'failed' as const,
      currentStage: 'completed' as const,
      errorMessage: '发布服务中断，请核对平台后重试',
      finishedAt: timestamp,
    };
    getPublishRunMock.mockResolvedValueOnce(pendingRun).mockResolvedValueOnce(failedRun);

    const response = await GET(new Request('http://localhost/api/jd/publish-runs/run-1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.status).toBe('failed');
  });

  it('still returns the terminal run when self-healing temporarily fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    reconcileTerminalRunMock.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET(new Request('http://localhost/api/jd/publish-runs/run-1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.status).toBe('success');
    expect(listPublishRunEventsMock).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
