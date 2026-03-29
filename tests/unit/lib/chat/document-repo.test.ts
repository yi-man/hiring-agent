import {
  deleteConversationDocument,
  getConversationDocumentById,
  setConversationDocumentStatus,
} from '@/lib/chat/repositories/document-repo';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversationDocument: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    conversationDocument: {
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
};

describe('document repository conversation scoping', () => {
  beforeEach(() => {
    prismaMock.conversationDocument.updateMany.mockReset();
    prismaMock.conversationDocument.findFirst.mockReset();
    prismaMock.conversationDocument.deleteMany.mockReset();
  });

  it('reads a single document by id and conversation', async () => {
    prismaMock.conversationDocument.findFirst.mockResolvedValueOnce({
      id: 'd1',
      conversationId: 'c1',
    });
    await getConversationDocumentById('c1', 'd1');

    expect(prismaMock.conversationDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'd1', conversationId: 'c1' },
    });
  });

  it('updates status only within the provided conversation scope', async () => {
    prismaMock.conversationDocument.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.conversationDocument.findFirst.mockResolvedValueOnce({
      id: 'd1',
      conversationId: 'c1',
      status: 'ready',
    });

    await setConversationDocumentStatus('c1', 'd1', 'ready');

    expect(prismaMock.conversationDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', conversationId: 'c1' },
      data: { status: 'ready', errorMessage: null },
    });
    expect(prismaMock.conversationDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'd1', conversationId: 'c1' },
    });
  });

  it('deletes a document only in the provided conversation scope', async () => {
    prismaMock.conversationDocument.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(deleteConversationDocument('c1', 'd1')).resolves.toBe(true);

    expect(prismaMock.conversationDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: 'd1', conversationId: 'c1' },
    });
  });
});
