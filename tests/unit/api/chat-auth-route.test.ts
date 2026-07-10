import { POST } from '@/app/api/chat/route';

const invokeLlmChatMock = jest.fn();
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

jest.mock('@/lib/llm', () => ({
  invokeLlmChat: (...args: unknown[]) => invokeLlmChatMock(...args),
}));

describe('chat auth route', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    requireAuthMock.mockReset();
    invokeLlmChatMock.mockReset();
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
    invokeLlmChatMock.mockResolvedValueOnce({
      content: 'ok',
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    const req = { json: async () => ({ message: 'hello' }) } as Request;
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reply).toBe('ok');
    expect(invokeLlmChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'chat.assistant',
        prompt: { id: 'chat.assistant', version: 'chat-assistant-v1' },
        responseFormat: 'text',
      }),
    );
  });
});
