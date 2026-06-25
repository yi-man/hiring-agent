/** @jest-environment node */

import {
  claimKnowledgeDocumentIngest,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  findKnowledgeDocumentBySourceLabel,
  replaceAndCompleteKnowledgeDocumentIngest,
  replaceKnowledgeDocumentChunks,
  searchKnowledgeDocumentChunks,
  vectorToPgLiteral,
} from '@/lib/rag/knowledge-repo';

type PrismaMock = {
  knowledgeDocument: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    updateMany: jest.Mock;
  };
  knowledgeDocumentChunk: {
    deleteMany: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeDocument: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    knowledgeDocumentChunk: {
      deleteMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as { prisma: PrismaMock };

describe('knowledge repository', () => {
  beforeEach(() => {
    prismaMock.knowledgeDocument.create.mockReset();
    prismaMock.knowledgeDocument.findFirst.mockReset();
    prismaMock.knowledgeDocument.findMany.mockReset();
    prismaMock.knowledgeDocument.deleteMany.mockReset();
    prismaMock.knowledgeDocument.updateMany.mockReset();
    prismaMock.knowledgeDocumentChunk.deleteMany.mockReset();
    prismaMock.$executeRaw.mockReset();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it('formats finite vectors for pgvector', () => {
    expect(vectorToPgLiteral([0.1, -2, 3])).toBe('[0.1,-2,3]');
  });

  it('rejects empty or non-finite vectors', () => {
    expect(() => vectorToPgLiteral([])).toThrow('empty vector');
    expect(() => vectorToPgLiteral([1, Number.NaN])).toThrow('non-finite vector');
  });

  it('creates documents scoped to a user', async () => {
    prismaMock.knowledgeDocument.create.mockResolvedValueOnce({ id: 'doc-1', userId: 'u1' });
    await createKnowledgeDocument({
      userId: 'u1',
      filename: 'handbook.md',
      title: 'Handbook',
      sourceLabel: 'source-1',
      contentMarkdown: '# Handbook',
      status: 'processing',
    });

    expect(prismaMock.knowledgeDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        filename: 'handbook.md',
        sourceLabel: 'source-1',
        contentMarkdown: '# Handbook',
        status: 'processing',
      }),
    });
  });

  it('finds source labels only within user scope', async () => {
    await findKnowledgeDocumentBySourceLabel('u1', 'synthetic');
    expect(prismaMock.knowledgeDocument.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', sourceLabel: 'synthetic' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('claims processing documents only in user scope', async () => {
    prismaMock.knowledgeDocument.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.knowledgeDocument.findFirst.mockResolvedValueOnce({ id: 'doc-1' });

    await claimKnowledgeDocumentIngest('u1', 'doc-1', 'ingest:1:abc', new Date(0));

    expect(prismaMock.knowledgeDocument.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        userId: 'u1',
        status: 'processing',
        OR: [{ errorMessage: null }, { updatedAt: { lt: new Date(0) } }],
      },
      data: { errorMessage: 'ingest:1:abc' },
    });
  });

  it('replaces chunks with raw pgvector inserts inside a transaction', async () => {
    const tx = {
      knowledgeDocumentChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await replaceKnowledgeDocumentChunks({
      documentId: 'doc-1',
      userId: 'u1',
      embeddingModel: 'text-embedding-3-small',
      chunks: [
        {
          id: 'chunk-1',
          chunkIndex: 0,
          content: 'hello',
          tokenEstimate: null,
          embedding: [0.1, 0.2],
        },
      ],
    });

    expect(tx.knowledgeDocumentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', userId: 'u1' },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('replaces chunks and completes ingest only while claim token owns the document', async () => {
    const tx = {
      knowledgeDocument: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
      knowledgeDocumentChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await replaceAndCompleteKnowledgeDocumentIngest({
      userId: 'u1',
      documentId: 'doc-1',
      claimToken: 'ingest:1:abc',
      embeddingModel: 'text-embedding-3-small',
      chunks: [
        {
          id: 'chunk-1',
          chunkIndex: 0,
          content: 'hello',
          tokenEstimate: null,
          embedding: [0.1, 0.2],
        },
      ],
    });

    expect(result).toBe(true);
    expect(tx.knowledgeDocument.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'doc-1',
        userId: 'u1',
        status: 'processing',
        errorMessage: 'ingest:1:abc',
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(tx.knowledgeDocumentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', userId: 'u1' },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.knowledgeDocument.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'doc-1',
        userId: 'u1',
        status: 'processing',
        errorMessage: 'ingest:1:abc',
      },
      data: { status: 'ready', errorMessage: null },
    });
  });

  it('does not replace chunks when claim token no longer owns the document', async () => {
    const tx = {
      knowledgeDocument: { updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }) },
      knowledgeDocumentChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await replaceAndCompleteKnowledgeDocumentIngest({
      userId: 'u1',
      documentId: 'doc-1',
      claimToken: 'ingest:lost',
      embeddingModel: 'text-embedding-3-small',
      chunks: [
        {
          id: 'chunk-1',
          chunkIndex: 0,
          content: 'hello',
          tokenEstimate: null,
          embedding: [0.1, 0.2],
        },
      ],
    });

    expect(result).toBe(false);
    expect(tx.knowledgeDocumentChunk.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('searches chunks with user, model, dimension, and ready document filters', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await searchKnowledgeDocumentChunks({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-3-small',
      topK: 4,
    });

    const sqlText = String(prismaMock.$queryRaw.mock.calls[0][0].strings.join(' '));
    expect(sqlText).toContain('c.user_id =');
    expect(sqlText).toContain("d.status = 'ready'");
    expect(sqlText).toContain('c.embedding_dimension =');
    expect(sqlText).toContain('ORDER BY c.embedding <=>');
  });

  it('deletes documents only for the current user', async () => {
    prismaMock.knowledgeDocument.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(deleteKnowledgeDocument('u1', 'doc-1')).resolves.toBe(true);
    expect(prismaMock.knowledgeDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', userId: 'u1' },
    });
  });
});
