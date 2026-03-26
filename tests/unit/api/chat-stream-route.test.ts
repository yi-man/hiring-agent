import { POST } from '@/app/api/conversations/[id]/messages/stream/route';

const streamChatReplyMock = jest.fn();
const createMessageMock = jest.fn();
const touchConversationMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

global.Response = class {
  status: number;
  body: ReadableStream<Uint8Array> | null;
  headers: Record<string, string>;
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.body = (body as ReadableStream<Uint8Array> | null) ?? null;
    this.headers = (init?.headers as Record<string, string>) ?? {};
  }
} as unknown as typeof Response;

jest.mock('@/lib/chat/chain', () => ({
  streamChatReply: (...args: unknown[]) => streamChatReplyMock(...args),
}));

jest.mock('@/lib/chat/repositories/message-repo', () => ({
  createMessage: (...args: unknown[]) => createMessageMock(...args),
}));

jest.mock('@/lib/chat/repositories/conversation-repo', () => ({
  touchConversation: (...args: unknown[]) => touchConversationMock(...args),
}));

describe('chat stream route', () => {
  beforeEach(() => {
    streamChatReplyMock.mockReset();
    createMessageMock.mockReset();
    touchConversationMock.mockReset();
  });

  it('rejects empty content', async () => {
    const req = { json: async () => ({ content: '  ' }) } as Request;
    const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('content is required');
  });

  it('writes user first, streams chunks, then writes assistant', async () => {
    async function* gen() {
      yield 'he';
      yield 'llo';
    }
    streamChatReplyMock.mockResolvedValueOnce({
      chunks: gen(),
      collect: async () => 'hello',
    });
    const req = { json: async () => ({ content: 'hello?' }) } as Request;
    const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      text += decoder.decode(part.value);
    }

    expect(text).toBe('hello');
    expect(createMessageMock).toHaveBeenNthCalledWith(1, {
      conversationId: 'c1',
      role: 'user',
      content: 'hello?',
    });
    expect(createMessageMock).toHaveBeenNthCalledWith(2, {
      conversationId: 'c1',
      role: 'assistant',
      content: 'hello',
    });
    expect(touchConversationMock).toHaveBeenCalledTimes(2);
    expect(streamChatReplyMock).toHaveBeenCalledWith('c1', 'hello?');
  });
});
