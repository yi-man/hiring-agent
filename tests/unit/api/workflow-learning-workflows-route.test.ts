import { GET, POST } from '@/app/api/workflow-learning/workflows/route';

const requireAuthMock = jest.fn();
const listWorkflowsMock = jest.fn();
const createWorkflowMock = jest.fn();

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
  listWorkflows: (...args: unknown[]) => listWorkflowsMock(...args),
  createWorkflow: (...args: unknown[]) => createWorkflowMock(...args),
}));

describe('workflow-learning workflows route', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    listWorkflowsMock.mockReset();
    createWorkflowMock.mockReset();
  });

  it('GET returns 401 when unauthenticated', async () => {
    const err = new Error('Unauthorized') as Error & { name?: string };
    err.name = 'UnauthorizedError';
    requireAuthMock.mockRejectedValueOnce(err);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('GET returns workflows for user', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    listWorkflowsMock.mockResolvedValueOnce([{ id: 'w1', name: 'wf' }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.workflows).toHaveLength(1);
  });

  it('POST validates request body', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    const req = { json: async () => ({ name: '', goal: '' }) } as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST creates workflow', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    createWorkflowMock.mockResolvedValueOnce({ id: 'w1', version: 1 });
    const req = {
      json: async () => ({
        name: 'wf',
        goal: 'g',
        steps: [
          { id: 's1', tool: 'browser_snapshot', args: {}, description: 'd', canBatch: false },
        ],
      }),
    } as Request;
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.workflow.id).toBe('w1');
  });
});
