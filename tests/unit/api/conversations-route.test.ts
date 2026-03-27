import { GET as getConversations, POST as postConversation } from '@/app/api/conversations/route';
import { GET as getMessages } from '@/app/api/conversations/[id]/messages/route';

const createConversationMock = jest.fn();
const listConversationsPaginatedMock = jest.fn();
const countConversationsMock = jest.fn();
const listMessagesMock = jest.fn();
const requireAuthMock = jest.fn();
const conversationFindFirstMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/chat/repositories/conversation-repo', () => ({
  createConversation: (...args: unknown[]) => createConversationMock(...args),
  listConversationsPaginated: (...args: unknown[]) => listConversationsPaginatedMock(...args),
  countConversations: (...args: unknown[]) => countConversationsMock(...args),
}));

jest.mock('@/lib/chat/repositories/message-repo', () => ({
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
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

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirstMock(...args),
    },
  },
}));

describe('conversation routes', () => {
  beforeEach(() => {
    createConversationMock.mockReset();
    listConversationsPaginatedMock.mockReset();
    countConversationsMock.mockReset();
    listMessagesMock.mockReset();
    requireAuthMock.mockReset();
    conversationFindFirstMock.mockReset();
  });

  it('creates conversation', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    createConversationMock.mockResolvedValueOnce({ id: 'c1' });
    const res = await postConversation();
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.conversation.id).toBe('c1');
    expect(createConversationMock).toHaveBeenCalledWith('u1');
  });

  it('lists conversations', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    listConversationsPaginatedMock.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    countConversationsMock.mockResolvedValueOnce(3);
    const res = await getConversations({
      url: 'http://localhost/api/conversations?page=1&limit=2',
    } as Request);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.hasMore).toBe(true);
    expect(listConversationsPaginatedMock).toHaveBeenCalledWith({
      limit: 2,
      offset: 0,
      userId: 'u1',
    });
    expect(countConversationsMock).toHaveBeenCalledWith('u1');
  });

  it('lists messages by conversation id', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    listMessagesMock.mockResolvedValueOnce([{ id: 'm1', role: 'user', content: 'x' }]);
    const res = await getMessages({} as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
  });

  it('returns 400 on invalid conversation id', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    const res = await getMessages({} as Request, {
      params: Promise.resolve({ id: '' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('conversation id is required');
  });

  it('returns 401 when creating conversation without auth', async () => {
    const error = new Error('Unauthorized') as Error & { status?: number; name?: string };
    error.name = 'UnauthorizedError';
    error.status = 401;
    requireAuthMock.mockRejectedValueOnce(error);
    const res = await postConversation();
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Unauthorized');
  });

  it('returns 404 for non-owner conversation message access', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce(null);
    const res = await getMessages({} as Request, {
      params: Promise.resolve({ id: 'c-not-owned' }),
    });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });
});
