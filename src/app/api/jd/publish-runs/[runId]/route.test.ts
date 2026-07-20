/** @jest-environment node */

import { GET } from './route';
import {
  getPublishRun,
  listPublishRunEvents,
  reconcileTerminalPublishRunWithRetry,
} from '@/lib/jd-publishing/publish-run-repo';

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

const getPublishRunMock = getPublishRun as jest.MockedFunction<typeof getPublishRun>;
const listPublishRunEventsMock = listPublishRunEvents as jest.MockedFunction<
  typeof listPublishRunEvents
>;
const reconcileTerminalRunMock = reconcileTerminalPublishRunWithRetry as jest.MockedFunction<
  typeof reconcileTerminalPublishRunWithRetry
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
    getPublishRunMock.mockResolvedValueOnce({
      ...successRun,
      status: 'running',
      currentStage: 'publishing',
      finishedAt: null,
    });

    const response = await GET(new Request('http://localhost/api/jd/publish-runs/run-1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    });

    expect(response.status).toBe(200);
    expect(reconcileTerminalRunMock).not.toHaveBeenCalled();
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
