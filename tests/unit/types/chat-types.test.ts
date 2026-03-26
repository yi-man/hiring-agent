import type {
  ChatRole,
  Conversation,
  ConversationStatus,
  CreateConversationResponse,
  ListConversationsResponse,
  ListMessagesResponse,
  Message,
  StreamMessageRequest,
} from '@/types';

describe('chat types', () => {
  it('supports role and status unions', () => {
    const role: ChatRole = 'assistant';
    const status: ConversationStatus = 'active';
    expect(role).toBe('assistant');
    expect(status).toBe('active');
  });

  it('supports conversation and message dto shapes', () => {
    const conversation: Conversation = {
      id: 'c1',
      userId: null,
      title: 'hello',
      status: 'active',
      lastActiveAt: '2026-03-26T10:00:00.000Z',
      createdAt: '2026-03-26T10:00:00.000Z',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
    const message: Message = {
      id: 'm1',
      conversationId: conversation.id,
      role: 'user',
      content: 'hi',
      seq: 1,
      tokenCount: null,
      createdAt: '2026-03-26T10:00:00.000Z',
    };

    const createResp: CreateConversationResponse = { conversation };
    const listConversations: ListConversationsResponse = {
      conversations: [conversation],
      total: 1,
    };
    const listMessages: ListMessagesResponse = {
      messages: [message],
      total: 1,
    };
    const streamReq: StreamMessageRequest = { content: 'stream me' };

    expect(createResp.conversation.id).toBe('c1');
    expect(listConversations.total).toBe(1);
    expect(listMessages.messages[0].role).toBe('user');
    expect(streamReq.content).toBe('stream me');
  });
});
