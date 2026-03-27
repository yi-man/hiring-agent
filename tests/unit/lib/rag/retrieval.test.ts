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
