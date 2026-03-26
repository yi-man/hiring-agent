import {
  countConversations,
  createConversation,
  listConversationsPaginated,
  touchConversation,
} from '@/lib/chat/repositories/conversation-repo';
import { createMessage, listMessages } from '@/lib/chat/repositories/message-repo';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    conversation: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    message: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
};

describe('chat repositories', () => {
  beforeEach(() => {
    prismaMock.conversation.create.mockReset();
    prismaMock.conversation.findMany.mockReset();
    prismaMock.conversation.count.mockReset();
    prismaMock.conversation.update.mockReset();
    prismaMock.message.findFirst.mockReset();
    prismaMock.message.findMany.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it('creates conversation and maps fields', async () => {
    prismaMock.conversation.create.mockResolvedValueOnce({
      id: 'c1',
      userId: 'u1',
      title: null,
      status: 'active',
      lastActiveAt: new Date('2026-03-26T00:00:00.000Z'),
      createdAt: new Date('2026-03-26T00:00:00.000Z'),
      updatedAt: new Date('2026-03-26T00:00:00.000Z'),
    });

    const result = await createConversation('u1');
    expect(prismaMock.conversation.create).toHaveBeenCalled();
    expect(result.id).toBe('c1');
    expect(result.userId).toBe('u1');
    expect(result.status).toBe('active');
  });

  it('lists conversations ordered by lastActiveAt from DB', async () => {
    prismaMock.conversation.findMany.mockResolvedValueOnce([
      {
        id: 'c2',
        userId: null,
        title: 'latest',
        status: 'active',
        lastActiveAt: new Date('2026-03-26T01:00:00.000Z'),
        createdAt: new Date('2026-03-26T01:00:00.000Z'),
        updatedAt: new Date('2026-03-26T01:00:00.000Z'),
      },
    ]);
    const rows = await listConversationsPaginated({ limit: 20, offset: 0 });
    expect(rows[0].id).toBe('c2');
    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith({
      orderBy: { lastActiveAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('increments message sequence before insert', async () => {
    const conversationUpdateMock = jest.fn();
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        conversation: {
          update: conversationUpdateMock,
        },
        message: {
          findFirst: async () => ({ seq: 2 }),
          create: async () => ({
            id: 'm1',
            conversationId: 'c1',
            role: 'user',
            content: 'hello',
            seq: 3,
            tokenCount: null,
            createdAt: new Date('2026-03-26T01:00:00.000Z'),
          }),
        },
      }),
    );
    const message = await createMessage({
      conversationId: 'c1',
      role: 'user',
      content: 'hello',
    });
    expect(message.seq).toBe(3);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(conversationUpdateMock).toHaveBeenCalledWith({
      data: { lastActiveAt: expect.any(Date), updatedAt: expect.any(Date) },
      where: { id: 'c1' },
    });
  });

  it('lists messages ordered by seq asc', async () => {
    prismaMock.message.findMany.mockResolvedValueOnce([
      {
        id: 'm1',
        conversationId: 'c1',
        role: 'user',
        content: 'a',
        seq: 1,
        tokenCount: null,
        createdAt: new Date('2026-03-26T01:00:00.000Z'),
      },
    ]);
    const rows = await listMessages('c1');
    expect(rows[0].seq).toBe(1);
    expect(prismaMock.message.findMany).toHaveBeenCalledWith({
      orderBy: { seq: 'asc' },
      take: 100,
      where: { conversationId: 'c1' },
    });
  });

  it('touches conversation last_active_at', async () => {
    await touchConversation('c1');
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      data: { lastActiveAt: expect.any(Date), updatedAt: expect.any(Date) },
      where: { id: 'c1' },
    });
  });

  it('counts conversations', async () => {
    prismaMock.conversation.count.mockResolvedValueOnce(8);
    await expect(countConversations()).resolves.toBe(8);
  });
});
