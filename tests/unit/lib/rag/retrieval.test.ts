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
});
