import { POST } from '@/app/api/workflow-learning/workflows/[id]/run/route';

const requireAuthMock = jest.fn();
const getWorkflowByIdMock = jest.fn();
const executeWorkflowWithRecoveryMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
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
    }
  },
}));

jest.mock('@/lib/workflow-learning/workflow-store', () => ({
  getWorkflowById: (...args: unknown[]) => getWorkflowByIdMock(...args),
}));

jest.mock('@/lib/workflow-learning/workflow-runner', () => ({
  executeWorkflowWithRecovery: (...args: unknown[]) => executeWorkflowWithRecoveryMock(...args),
}));

describe('workflow-learning run route', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getWorkflowByIdMock.mockReset();
    executeWorkflowWithRecoveryMock.mockReset();
  });

  it('returns 404 when workflow missing', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    getWorkflowByIdMock.mockResolvedValueOnce(null);
    const req = {} as Request;
    const res = await POST(req, { params: Promise.resolve({ id: 'w1' }) });
    expect(res.status).toBe(404);
  });

  it('executes workflow and returns result', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    getWorkflowByIdMock.mockResolvedValueOnce({ id: 'w1', steps: [] });
    executeWorkflowWithRecoveryMock.mockResolvedValueOnce({
      runId: 'r1',
      success: true,
      recovered: false,
      steps: [],
    });
    const req = {} as Request;
    const res = await POST(req, { params: Promise.resolve({ id: 'w1' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result.runId).toBe('r1');
  });
});
