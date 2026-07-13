import { parseEnv } from '@/lib/env';

describe('RAG env defaults', () => {
  it('uses sane default values for rag keys', () => {
    const parsed = parseEnv({});

    expect(parsed.RAG_TOP_K).toBe(6);
    expect(parsed.RAG_MIN_SCORE).toBe(0);
    expect(parsed.RAG_CONTEXT_MAX_CHARS).toBe(6000);
    expect(parsed.OPENAI_EMBEDDING_USE_MULTIMODAL).toBe('auto');
    expect(parsed.OPENAI_EMBEDDING_MODEL).toBe('doubao-embedding-vision-250615');
    expect((parsed as { QDRANT_URL?: string }).QDRANT_URL).toBeUndefined();
  });

  it('parses dedicated embedding provider configuration', () => {
    const parsed = parseEnv({
      EMBEDDING_API_KEY: 'embedding-key',
      EMBEDDING_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      EMBEDDING_MODEL: 'text-embedding-v3',
    });

    expect(parsed).toMatchObject({
      EMBEDDING_API_KEY: 'embedding-key',
      EMBEDDING_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      EMBEDDING_MODEL: 'text-embedding-v3',
    });
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

  it('preserves valid keys when one key is invalid', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const parsed = parseEnv({
      RAG_TOP_K: 'not-a-number',
      OPENAI_BASE_URL: 'https://example.com/v1',
      POSTGRES_HOST: 'db.internal',
    });

    expect(parsed.RAG_TOP_K).toBe(6);
    expect(parsed.OPENAI_BASE_URL).toBe('https://example.com/v1');
    expect(parsed.POSTGRES_HOST).toBe('db.internal');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('embedding infrastructure', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
      OPENAI_EMBEDDING_USE_MULTIMODAL: 'false',
    };
    process.env.EMBEDDING_API_KEY = '';
    process.env.EMBEDDING_BASE_URL = '';
    process.env.EMBEDDING_MODEL = '';
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

  it('uses dedicated embedding base URL, API key, and model when configured', async () => {
    process.env.OPENAI_BASE_URL = 'https://chat.example.com/v1';
    process.env.OPENAI_API_KEY = 'chat-key';
    process.env.OPENAI_EMBEDDING_MODEL = 'legacy-embedding-model';
    process.env.EMBEDDING_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    process.env.EMBEDDING_API_KEY = 'embedding-key';
    process.env.EMBEDDING_MODEL = 'text-embedding-v3';
    process.env.OPENAI_EMBEDDING_USE_MULTIMODAL = 'auto';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.7, 0.8] }] }),
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedQuery('hello')).resolves.toEqual([0.7, 0.8]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings');
    expect((init as RequestInit)?.headers).toMatchObject({
      Authorization: 'Bearer embedding-key',
    });
    expect(JSON.parse(String((init as RequestInit)?.body))).toMatchObject({
      model: 'text-embedding-v3',
      input: 'hello',
    });
  });

  it('uses multimodal endpoint when model name contains embedding-vision', async () => {
    process.env.OPENAI_EMBEDDING_MODEL = 'doubao-embedding-vision-250615';
    process.env.OPENAI_EMBEDDING_USE_MULTIMODAL = 'auto';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { embedding: [0.5, 0.6] } }),
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedQuery('hello')).resolves.toEqual([0.5, 0.6]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/embeddings/multimodal');
    const body = JSON.parse(String((init as RequestInit)?.body));
    expect(body).toEqual({
      model: 'doubao-embedding-vision-250615',
      input: [{ type: 'text', text: 'hello' }],
    });
  });

  it('embedDocuments calls multimodal once per chunk', async () => {
    process.env.OPENAI_EMBEDDING_MODEL = 'doubao-embedding-vision-250615';
    process.env.OPENAI_EMBEDDING_USE_MULTIMODAL = 'auto';

    global.fetch = jest.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      const text = (body.input as Array<{ text: string }>)[0]?.text;
      const vec = text === 'a' ? [0.1, 0.2] : [0.2, 0.4];
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { embedding: vec } }),
      });
    }) as unknown as typeof fetch;

    const embed = await import('@/lib/rag/embed');
    await expect(embed.embedDocuments(['a', 'b'])).resolves.toEqual([
      [0.1, 0.2],
      [0.2, 0.4],
    ]);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2);
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

  it('searches conversation chunks with model and min score', async () => {
    const searchMock = jest.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        conversationId: 'conv-1',
        chunkIndex: 0,
        content: 'PTO is 20 days.',
        filename: 'policy.md',
        score: 0.92,
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
      getConfiguredEmbeddingModel: () => 'text-embedding-v3',
    }));
    jest.doMock('@/lib/chat/repositories/document-repo', () => ({
      searchConversationDocumentChunks: (...args: unknown[]) => searchMock(...args),
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    const result = await retrieveConversationContext({
      conversationId: 'conv-1',
      query: 'How many PTO days?',
      topK: 3,
    });

    expect(searchMock).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-v3',
      topK: 3,
      minScore: 0.6,
      documentId: null,
    });
    expect(result.contextText).toContain('[source filename="policy.md" chunkIndex=0]');
    expect(result.contextText).toContain('PTO is 20 days.');
    expect(result.matches).toHaveLength(1);
  });

  it('passes documentId scope to search when provided', async () => {
    const searchMock = jest.fn().mockResolvedValue([]);
    jest.doMock('@/lib/env', () => ({
      env: {
        RAG_TOP_K: 6,
        RAG_MIN_SCORE: 0.6,
        RAG_CONTEXT_MAX_CHARS: 1000,
      },
    }));
    jest.doMock('@/lib/rag/embed', () => ({
      embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      getConfiguredEmbeddingModel: () => 'text-embedding-v3',
    }));
    jest.doMock('@/lib/chat/repositories/document-repo', () => ({
      searchConversationDocumentChunks: (...args: unknown[]) => searchMock(...args),
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    await retrieveConversationContext({
      conversationId: 'conv-1',
      query: 'q',
      topK: 3,
      documentId: 'doc-x',
    });

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-x',
      }),
    );
  });

  it('enforces context max chars when building output', async () => {
    const searchMock = jest.fn().mockResolvedValue([
      {
        id: 'chunk-a',
        documentId: 'doc-a',
        conversationId: 'conv-1',
        chunkIndex: 0,
        content: '12345',
        filename: 'a.md',
        score: 0.95,
      },
      {
        id: 'chunk-b',
        documentId: 'doc-b',
        conversationId: 'conv-1',
        chunkIndex: 1,
        content: '67890',
        filename: 'b.md',
        score: 0.9,
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
      getConfiguredEmbeddingModel: () => 'text-embedding-v3',
    }));
    jest.doMock('@/lib/chat/repositories/document-repo', () => ({
      searchConversationDocumentChunks: (...args: unknown[]) => searchMock(...args),
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
        id: 'chunk-big',
        documentId: 'doc-big',
        conversationId: 'conv-1',
        chunkIndex: 0,
        content: '1234567890',
        filename: 'big.md',
        score: 0.99,
      },
      {
        id: 'chunk-small',
        documentId: 'doc-small',
        conversationId: 'conv-1',
        chunkIndex: 1,
        content: 'ok',
        filename: 'small.md',
        score: 0.95,
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
      getConfiguredEmbeddingModel: () => 'text-embedding-v3',
    }));
    jest.doMock('@/lib/chat/repositories/document-repo', () => ({
      searchConversationDocumentChunks: (...args: unknown[]) => searchMock(...args),
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

  it('returns empty context when search has no hits', async () => {
    const searchMock = jest.fn().mockResolvedValue([]);
    jest.doMock('@/lib/env', () => ({
      env: {
        RAG_TOP_K: 6,
        RAG_MIN_SCORE: 0.6,
        RAG_CONTEXT_MAX_CHARS: 1000,
      },
    }));
    jest.doMock('@/lib/rag/embed', () => ({
      embedQuery: jest.fn().mockResolvedValue([0.1, 0.2]),
      getConfiguredEmbeddingModel: () => 'text-embedding-v3',
    }));
    jest.doMock('@/lib/chat/repositories/document-repo', () => ({
      searchConversationDocumentChunks: (...args: unknown[]) => searchMock(...args),
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    await expect(
      retrieveConversationContext({
        conversationId: 'conv-1',
        query: 'anything',
      }),
    ).resolves.toEqual({ contextText: '', matches: [] });
  });

  it('returns empty when query is blank', async () => {
    const searchMock = jest.fn();
    jest.doMock('@/lib/env', () => ({
      env: {
        RAG_TOP_K: 6,
        RAG_MIN_SCORE: 0.6,
        RAG_CONTEXT_MAX_CHARS: 1000,
      },
    }));
    jest.doMock('@/lib/rag/embed', () => ({
      embedQuery: jest.fn(),
      getConfiguredEmbeddingModel: () => 'text-embedding-v3',
    }));
    jest.doMock('@/lib/chat/repositories/document-repo', () => ({
      searchConversationDocumentChunks: (...args: unknown[]) => searchMock(...args),
    }));

    const { retrieveConversationContext } = await import('@/lib/rag/retrieval');
    await expect(
      retrieveConversationContext({
        conversationId: 'conv-1',
        query: '   ',
      }),
    ).resolves.toEqual({ contextText: '', matches: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });
});
