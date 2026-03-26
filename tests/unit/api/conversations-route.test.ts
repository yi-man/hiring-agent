import { GET as getConversations, POST as postConversation } from '@/app/api/conversations/route';
import { GET as getMessages } from '@/app/api/conversations/[id]/messages/route';

const createConversationMock = jest.fn();
const listConversationsPaginatedMock = jest.fn();
const countConversationsMock = jest.fn();
const listMessagesMock = jest.fn();

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

describe('conversation routes', () => {
  beforeEach(() => {
    createConversationMock.mockReset();
    listConversationsPaginatedMock.mockReset();
    countConversationsMock.mockReset();
    listMessagesMock.mockReset();
  });

  it('creates conversation', async () => {
    createConversationMock.mockResolvedValueOnce({ id: 'c1' });
    const res = await postConversation();
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.conversation.id).toBe('c1');
  });

  it('lists conversations', async () => {
    listConversationsPaginatedMock.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]);
    countConversationsMock.mockResolvedValueOnce(3);
    const res = await getConversations({
      url: 'http://localhost/api/conversations?page=1&limit=2',
    } as Request);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.hasMore).toBe(true);
  });

  it('lists messages by conversation id', async () => {
    listMessagesMock.mockResolvedValueOnce([{ id: 'm1', role: 'user', content: 'x' }]);
    const res = await getMessages({} as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
  });

  it('returns 400 on invalid conversation id', async () => {
    const res = await getMessages({} as Request, {
      params: Promise.resolve({ id: '' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('conversation id is required');
  });
});
