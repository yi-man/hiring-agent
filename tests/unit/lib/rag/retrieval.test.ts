import { parseEnv } from '@/lib/env';

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn(),
}));

describe('RAG env defaults', () => {
  it('uses sane default values for rag and qdrant keys', () => {
    const parsed = parseEnv({});

    expect(parsed.QDRANT_URL).toBe('http://127.0.0.1:6333');
    expect(parsed.QDRANT_API_KEY).toBeUndefined();
    expect(parsed.QDRANT_COLLECTION_NAME).toBe('conversation_markdown_chunks');
    expect(parsed.RAG_TOP_K).toBe(6);
    expect(parsed.RAG_MIN_SCORE).toBe(0);
    expect(parsed.RAG_CONTEXT_MAX_CHARS).toBe(6000);
  });

  it('coerces number-based rag fields from strings', () => {
    const parsed = parseEnv({
      RAG_TOP_K: '10',
      RAG_MIN_SCORE: '0.42',
      RAG_CONTEXT_MAX_CHARS: '9000',
    });

    expect(parsed.RAG_TOP_K).toBe(10);
    expect(parsed.RAG_MIN_SCORE).toBeCloseTo(0.42);
    expect(parsed.RAG_CONTEXT_MAX_CHARS).toBe(9000);
  });

  it('falls back to default qdrant url when invalid', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const parsed = parseEnv({
      QDRANT_URL: 'not-a-url',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(parsed.QDRANT_URL).toBe('http://127.0.0.1:6333');
    consoleErrorSpy.mockRestore();
  });

  it('preserves valid keys when one key is invalid', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const parsed = parseEnv({
      QDRANT_URL: 'not-a-url',
      RAG_TOP_K: '11',
      OPENAI_BASE_URL: 'https://example.com/v1',
      MYSQL_HOST: 'db.internal',
    });

    expect(parsed.QDRANT_URL).toBe('http://127.0.0.1:6333');
    expect(parsed.RAG_TOP_K).toBe(11);
    expect(parsed.OPENAI_BASE_URL).toBe('https://example.com/v1');
    expect(parsed.MYSQL_HOST).toBe('db.internal');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('qdrant retrieval infrastructure', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns existing collection without creating', async () => {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({}),
      createCollection: jest.fn(),
    };
    (QdrantClient as unknown as jest.Mock).mockImplementation(() => mockClient);

    const rag = await import('@/lib/rag/qdrant');
    await rag.ensureCollection({ vectorSize: 1536 });

    expect(rag.qdrantCollectionName).toBe('conversation_markdown_chunks');
    expect(QdrantClient).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:6333',
      apiKey: undefined,
    });
    expect(mockClient.getCollection).toHaveBeenCalledWith('conversation_markdown_chunks');
    expect(mockClient.createCollection).not.toHaveBeenCalled();
  });

  it('creates collection when qdrant returns 404', async () => {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const mockClient = {
      getCollection: jest.fn().mockRejectedValue({ status: 404 }),
      createCollection: jest.fn().mockResolvedValue({}),
    };
    (QdrantClient as unknown as jest.Mock).mockImplementation(() => mockClient);

    const rag = await import('@/lib/rag/qdrant');
    await rag.ensureCollection({ vectorSize: 3072, distance: 'Dot' });

    expect(mockClient.createCollection).toHaveBeenCalledWith('conversation_markdown_chunks', {
      vectors: {
        size: 3072,
        distance: 'Dot',
      },
    });
  });

  it('rethrows unexpected qdrant errors', async () => {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const fatalError = new Error('qdrant unavailable');
    const mockClient = {
      getCollection: jest.fn().mockRejectedValue(fatalError),
      createCollection: jest.fn(),
    };
    (QdrantClient as unknown as jest.Mock).mockImplementation(() => mockClient);

    const rag = await import('@/lib/rag/qdrant');
    await expect(rag.ensureCollection({ vectorSize: 1536 })).rejects.toThrow('qdrant unavailable');
    expect(mockClient.createCollection).not.toHaveBeenCalled();
  });

  it('treats create conflict as success by rechecking collection', async () => {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const mockClient = {
      getCollection: jest.fn().mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({}),
      createCollection: jest.fn().mockRejectedValue({ status: 409 }),
    };
    (QdrantClient as unknown as jest.Mock).mockImplementation(() => mockClient);

    const rag = await import('@/lib/rag/qdrant');
    await expect(rag.ensureCollection({ vectorSize: 1536 })).resolves.toBeUndefined();
    expect(mockClient.getCollection).toHaveBeenCalledTimes(2);
    expect(mockClient.createCollection).toHaveBeenCalledTimes(1);
  });

  it('rethrows create conflict when post-conflict recheck fails', async () => {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const conflictError = { status: 409 };
    const mockClient = {
      getCollection: jest
        .fn()
        .mockRejectedValueOnce({ status: 404 })
        .mockRejectedValueOnce({ status: 404 }),
      createCollection: jest.fn().mockRejectedValue(conflictError),
    };
    (QdrantClient as unknown as jest.Mock).mockImplementation(() => mockClient);

    const rag = await import('@/lib/rag/qdrant');
    await expect(rag.ensureCollection({ vectorSize: 1536 })).rejects.toEqual({ status: 404 });
  });
});

describe('embedding infrastructure', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('throws when embeddings data payload is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedQuery('hello')).rejects.toThrow('empty or malformed data payload');
  });

  it('throws when embedding vector is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [] }] }),
    }) as unknown as typeof fetch;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedQuery('hello')).rejects.toThrow('empty or malformed vector');
  });

  it('throws when embedding vector has non-numeric values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, '2', 3] }] }),
    }) as unknown as typeof fetch;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedQuery('hello')).rejects.toThrow('non-numeric vector values');
  });

  it('returns numeric vectors for embedDocuments', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
    }) as unknown as typeof fetch;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedDocuments(['a', 'b'])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });
});

describe('retrieveConversationContext', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('searches with conversationId filter and score threshold', async () => {
    const searchMock = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        score: 0.92,
        payload: {
          conversationId: 'conv-1',
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          filename: 'policy.md',
        },
      },
    ]);
    const findManyMock = jest.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        qdrantPointId: 'p1',
        content: 'PTO is 20 days.',
      },
    ]);

    jest.doMock('@/lib/env', () => ({
      env: {
        RAG_TOP_K: 6,
        RAG_MIN_SCORE: 0.6,
        RAG_CONTEXT_MAX_CHARS: 1000,
      },
    }));
    jest.doMock('@/lib/rag/embed', () => ({
      embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    }));
    jest.doMock('@/lib/rag/qdrant', () => ({
      qdrantCollectionName: 'conversation_markdown_chunks',
      getQdrantClient: () => ({
        search: searchMock,
      }),
    }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: {
        conversationDocumentChunk: {
          findMany: findManyMock,
        },
      },
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    const result = await retrieveConversationContext({
      conversationId: 'conv-1',
      query: 'How many PTO days?',
      topK: 3,
    });

    expect(searchMock).toHaveBeenCalledWith(
      'conversation_markdown_chunks',
      expect.objectContaining({
        limit: 3,
        score_threshold: 0.6,
        filter: {
          must: [{ key: 'conversationId', match: { value: 'conv-1' } }],
        },
      }),
    );
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 'conv-1',
        }),
      }),
    );
    expect(result.contextText).toContain('[source filename="policy.md" chunkIndex=0]');
    expect(result.contextText).toContain('PTO is 20 days.');
    expect(result.matches).toHaveLength(1);
  });

  it('enforces minScore and context max chars when building output', async () => {
    const searchMock = jest.fn().mockResolvedValue([
      {
        id: 'p-low',
        score: 0.2,
        payload: {
          conversationId: 'conv-1',
          documentId: 'doc-low',
          chunkId: 'chunk-low',
          chunkIndex: 0,
          filename: 'low.md',
        },
      },
      {
        id: 'p-a',
        score: 0.95,
        payload: {
          conversationId: 'conv-1',
          documentId: 'doc-a',
          chunkId: 'chunk-a',
          chunkIndex: 0,
          filename: 'a.md',
        },
      },
      {
        id: 'p-b',
        score: 0.9,
        payload: {
          conversationId: 'conv-1',
          documentId: 'doc-b',
          chunkId: 'chunk-b',
          chunkIndex: 1,
          filename: 'b.md',
        },
      },
    ]);
    const findManyMock = jest.fn().mockResolvedValue([
      {
        id: 'chunk-low',
        qdrantPointId: 'p-low',
        content: 'ignored',
      },
      {
        id: 'chunk-a',
        qdrantPointId: 'p-a',
        content: '12345',
      },
      {
        id: 'chunk-b',
        qdrantPointId: 'p-b',
        content: '67890',
      },
    ]);

    jest.doMock('@/lib/env', () => ({
      env: {
        RAG_TOP_K: 6,
        RAG_MIN_SCORE: 0.5,
        RAG_CONTEXT_MAX_CHARS: 45,
      },
    }));
    jest.doMock('@/lib/rag/embed', () => ({
      embedQuery: jest.fn().mockResolvedValue([0.4, 0.5]),
    }));
    jest.doMock('@/lib/rag/qdrant', () => ({
      qdrantCollectionName: 'conversation_markdown_chunks',
      getQdrantClient: () => ({
        search: searchMock,
      }),
    }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: {
        conversationDocumentChunk: {
          findMany: findManyMock,
        },
      },
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    const result = await retrieveConversationContext({
      conversationId: 'conv-1',
      query: 'question',
      topK: 5,
    });

    expect(result.contextText).toBe('[source filename="a.md" chunkIndex=0]\n12345');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.chunkId).toBe('chunk-a');
  });

  it('skips oversized hit and still includes later smaller hit', async () => {
    const searchMock = jest.fn().mockResolvedValue([
      {
        id: 'p-big',
        score: 0.99,
        payload: {
          conversationId: 'conv-1',
          documentId: 'doc-big',
          chunkId: 'chunk-big',
          chunkIndex: 0,
          filename: 'big.md',
        },
      },
      {
        id: 'p-small',
        score: 0.95,
        payload: {
          conversationId: 'conv-1',
          documentId: 'doc-small',
          chunkId: 'chunk-small',
          chunkIndex: 1,
          filename: 'small.md',
        },
      },
    ]);
    const findManyMock = jest.fn().mockResolvedValue([
      {
        id: 'chunk-big',
        qdrantPointId: 'p-big',
        content: '1234567890',
      },
      {
        id: 'chunk-small',
        qdrantPointId: 'p-small',
        content: 'ok',
      },
    ]);

    jest.doMock('@/lib/env', () => ({
      env: {
        RAG_TOP_K: 6,
        RAG_MIN_SCORE: 0.5,
        RAG_CONTEXT_MAX_CHARS: 45,
      },
    }));
    jest.doMock('@/lib/rag/embed', () => ({
      embedQuery: jest.fn().mockResolvedValue([0.7, 0.8]),
    }));
    jest.doMock('@/lib/rag/qdrant', () => ({
      qdrantCollectionName: 'conversation_markdown_chunks',
      getQdrantClient: () => ({
        search: searchMock,
      }),
    }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: {
        conversationDocumentChunk: {
          findMany: findManyMock,
        },
      },
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    const result = await retrieveConversationContext({
      conversationId: 'conv-1',
      query: 'question',
      topK: 5,
    });

    expect(result.contextText).toBe('[source filename="small.md" chunkIndex=1]\nok');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.chunkId).toBe('chunk-small');
  });
});
