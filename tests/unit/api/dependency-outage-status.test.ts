import { POST as postChat } from '@/app/api/chat/route';
import { GET as getConversations, POST as postConversation } from '@/app/api/conversations/route';
import { GET as getMessages } from '@/app/api/conversations/[id]/messages/route';
import { POST as postStreamMessage } from '@/app/api/conversations/[id]/messages/stream/route';

const requireAuthMock = jest.fn();
const invokeLlmChatMock = jest.fn();
const createConversationMock = jest.fn();
const listConversationsPaginatedMock = jest.fn();
const countConversationsMock = jest.fn();
const listMessagesMock = jest.fn();
const conversationFindFirstMock = jest.fn();

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

jest.mock('@/lib/llm/openai-chat', () => ({
  invokeLlmChat: (...args: unknown[]) => invokeLlmChatMock(...args),
}));

jest.mock('@/lib/chat/repositories/conversation-repo', () => ({
  createConversation: (...args: unknown[]) => createConversationMock(...args),
  listConversationsPaginated: (...args: unknown[]) => listConversationsPaginatedMock(...args),
  countConversations: (...args: unknown[]) => countConversationsMock(...args),
  touchConversation: jest.fn(),
}));

jest.mock('@/lib/chat/repositories/message-repo', () => ({
  listMessages: (...args: unknown[]) => listMessagesMock(...args),
  createMessage: jest.fn(),
}));

jest.mock('@/lib/chat/chain', () => ({
  streamChatReply: jest.fn(),
}));

jest.mock('@/lib/rag/retrieval', () => ({
  retrieveConversationContext: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirstMock(...args),
    },
  },
}));

describe('dependency outage status mapping', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    requireAuthMock.mockReset();
    invokeLlmChatMock.mockReset();
    createConversationMock.mockReset();
    listConversationsPaginatedMock.mockReset();
    countConversationsMock.mockReset();
    listMessagesMock.mockReset();
    conversationFindFirstMock.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  function makeOutageError(message = 'connect ECONNREFUSED 127.0.0.1:6379') {
    const error = new Error(message) as Error & { code?: string };
    error.code = 'ECONNREFUSED';
    return error;
  }

  it('maps auth dependency outage to 503 in chat route', async () => {
    requireAuthMock.mockRejectedValueOnce(makeOutageError('Prisma error P1001'));
    const req = { json: async () => ({ message: 'hello' }) } as Request;
    const res = await postChat(req);
    expect(res.status).toBe(503);
  });

  it('maps conversation create outage to 503', async () => {
    createConversationMock.mockRejectedValueOnce(
      makeOutageError('PrismaClientInitializationError P1001'),
    );
    const res = await postConversation();
    expect(res.status).toBe(503);
  });

  it('maps conversation list outage to 503', async () => {
    listConversationsPaginatedMock.mockRejectedValueOnce(makeOutageError());
    const res = await getConversations({
      url: 'http://localhost/api/conversations?page=1&limit=20',
    } as Request);
    expect(res.status).toBe(503);
  });

  it('maps message list outage to 503', async () => {
    conversationFindFirstMock.mockRejectedValueOnce(makeOutageError('connection timed out'));
    const res = await getMessages({} as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(503);
  });

  it('maps message stream outage to 503', async () => {
    conversationFindFirstMock.mockRejectedValueOnce(makeOutageError('Redis connect timeout'));
    const req = { json: async () => ({ content: 'hello' }) } as Request;
    const res = await postStreamMessage(req, {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(503);
  });

  it('does not map logical validation errors to 503', async () => {
    listConversationsPaginatedMock.mockRejectedValueOnce(new Error('invalid page number'));
    const res = await getConversations({
      url: 'http://localhost/api/conversations?page=1&limit=20',
    } as Request);
    expect(res.status).toBe(500);
  });
});
