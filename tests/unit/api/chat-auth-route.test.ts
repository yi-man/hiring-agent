import { POST } from '@/app/api/chat/route';

const invokeMock = jest.fn();
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
    }
  },
}));

jest.mock('@langchain/core/messages', () => ({
  HumanMessage: class {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
  SystemMessage: class {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke = (...args: unknown[]) => invokeMock(...args);
  },
}));

describe('chat auth route', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    requireAuthMock.mockReset();
    invokeMock.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it('returns 401 when session is missing', async () => {
    const error = new Error('Unauthorized') as Error & { status?: number; name?: string };
    error.name = 'UnauthorizedError';
    error.status = 401;
    requireAuthMock.mockRejectedValueOnce(error);
    const req = { json: async () => ({ message: 'hello' }) } as Request;
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Unauthorized');
  });

  it('returns success for authenticated user', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    invokeMock.mockResolvedValueOnce({ text: 'ok' });
    const req = { json: async () => ({ message: 'hello' }) } as Request;
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reply).toBe('ok');
  });
});
