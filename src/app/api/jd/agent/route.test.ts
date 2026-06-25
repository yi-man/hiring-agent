/**
 * @jest-environment node
 */
import { POST } from '@/app/api/jd/agent/route';
import { runJDAgent } from '@/lib/jd-agent/service';

const requireAuthMock = jest.fn();

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
      this.name = 'UnauthorizedError';
    }
  },
}));

jest.mock('@/lib/jd-agent/service', () => ({
  runJDAgent: jest.fn(),
}));

const runJDAgentMock = runJDAgent as jest.MockedFunction<typeof runJDAgent>;

describe('POST /api/jd/agent', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    runJDAgentMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    runJDAgentMock.mockResolvedValue({
      jd: {
        title: '高级前端工程师',
        summary: 'summary',
        responsibilities: ['r1'],
        requirements: ['q1'],
        bonus: [],
        highlights: ['h1'],
      },
      evaluation: {
        scores: { clarity: 8, completeness: 8, attractiveness: 8, specificity: 8 },
        issues: [],
        evidence: [],
        suggestions: [],
        rewrite_required: false,
      },
      decision: { improved: false, picked: 'original' },
      meta: {
        model: 'mock-jd-agent',
        promptVersion: 'jd_v3.2',
        action: 'initial_generate',
      },
    });
  });

  it('returns 401 when request is unauthenticated', async () => {
    const error = new Error('Unauthorized') as Error & { status?: number; name?: string };
    error.name = 'UnauthorizedError';
    error.status = 401;
    requireAuthMock.mockRejectedValueOnce(error);

    const request = new Request('http://localhost/api/jd/agent', {
      method: 'POST',
      body: JSON.stringify({ action: 'initial_generate', jobInput: '高级前端工程师' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toContain('Unauthorized');
    expect(runJDAgentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when action is missing', async () => {
    const request = new Request('http://localhost/api/jd/agent', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns success payload for initial_generate', async () => {
    const request = new Request('http://localhost/api/jd/agent', {
      method: 'POST',
      body: JSON.stringify({ action: 'initial_generate', jobInput: '高级前端工程师' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    const data = (await response.json()) as { success: boolean };
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(runJDAgentMock).toHaveBeenCalledWith(
      { action: 'initial_generate', jobInput: '高级前端工程师' },
      { userId: 'user-1' },
    );
  });
});
