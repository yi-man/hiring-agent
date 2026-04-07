import { POST } from '@/app/api/workflow-learning/workflows/generate/route';

const requireAuthMock = jest.fn();
const runWorkflowAgentWithEventsMock = jest.fn();
const solidifyWorkflowFromEventsMock = jest.fn();

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

jest.mock('@/lib/workflow-learning/agent-runner', () => ({
  runWorkflowAgentWithEvents: (...args: unknown[]) => runWorkflowAgentWithEventsMock(...args),
}));

jest.mock('@/lib/workflow-learning/workflow-solidifier', () => ({
  solidifyWorkflowFromEvents: (...args: unknown[]) => solidifyWorkflowFromEventsMock(...args),
}));

describe('workflow-learning generate route', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    runWorkflowAgentWithEventsMock.mockReset();
    solidifyWorkflowFromEventsMock.mockReset();
  });

  it('returns 400 when goal missing', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    const req = { json: async () => ({ goal: '' }) } as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns generated steps', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    async function* gen() {
      yield { type: 'run_start', runId: 'r1', timestamp: new Date().toISOString() };
      yield { type: 'run_end', runId: 'r1', timestamp: new Date().toISOString() };
    }
    runWorkflowAgentWithEventsMock.mockReturnValueOnce(gen());
    solidifyWorkflowFromEventsMock.mockResolvedValueOnce([
      { id: 's1', tool: 'browser_snapshot', args: {}, description: 'd', canBatch: false },
    ]);
    const req = { json: async () => ({ goal: 'test goal' }) } as Request;
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.steps).toHaveLength(1);
  });
});
