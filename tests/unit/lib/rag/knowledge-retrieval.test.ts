const embedQueryMock = jest.fn();
const hasReadyMock = jest.fn();
const searchMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    RAG_TOP_K: 6,
    RAG_MIN_SCORE: 0.5,
    RAG_CONTEXT_MAX_CHARS: 120,
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedQuery: (...args: unknown[]) => embedQueryMock(...args),
}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  hasReadyKnowledgeDocuments: (...args: unknown[]) => hasReadyMock(...args),
  searchKnowledgeDocumentChunks: (...args: unknown[]) => searchMock(...args),
}));

describe('retrieveUserKnowledgeContext', () => {
  beforeEach(() => {
    embedQueryMock.mockReset();
    hasReadyMock.mockReset();
    searchMock.mockReset();
    hasReadyMock.mockResolvedValue(true);
  });

  it('returns empty context without embedding when query is blank', async () => {
    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    await expect(retrieveUserKnowledgeContext({ userId: 'u1', query: '  ' })).resolves.toEqual({
      contextText: '',
      matches: [],
    });
    expect(embedQueryMock).not.toHaveBeenCalled();
  });

  it('returns empty context without embedding when user has no ready knowledge', async () => {
    hasReadyMock.mockResolvedValueOnce(false);
    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: '绩效要求' });
    expect(result.contextText).toBe('');
    expect(result.matches).toEqual([]);
    expect(embedQueryMock).not.toHaveBeenCalled();
  });

  it('embeds query and formats user-scoped knowledge sources', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 2,
        content: '今年绩效要求强调高质量交付。',
        filename: 'handbook.md',
        title: '招聘手册',
        sourceLabel: 'synthetic',
        score: 0.91,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: '绩效要求', topK: 3 });

    expect(searchMock).toHaveBeenCalledWith({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-3-small',
      topK: 3,
      documentId: null,
    });
    expect(result.contextText).toContain('[knowledge source filename="handbook.md" chunkIndex=2]');
    expect(result.contextText).toContain('今年绩效要求强调高质量交付。');
    expect(result.matches).toEqual([
      expect.objectContaining({
        score: 0.91,
        documentId: 'doc-1',
        chunkId: 'chunk-1',
        filename: 'handbook.md',
      }),
    ]);
  });

  it('drops hits below min score', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'chunk-low',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'low',
        filename: 'low.md',
        title: null,
        sourceLabel: null,
        score: 0.1,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: 'anything' });
    expect(result.contextText).toBe('');
    expect(result.matches).toEqual([]);
  });

  it('skips oversized hits and still includes later smaller hits', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'big',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'x'.repeat(200),
        filename: 'big.md',
        title: null,
        sourceLabel: null,
        score: 0.9,
      },
      {
        id: 'small',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 1,
        content: 'ok',
        filename: 'small.md',
        title: null,
        sourceLabel: null,
        score: 0.9,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: 'anything' });
    expect(result.contextText).toContain('small.md');
    expect(result.contextText).toContain('ok');
    expect(result.contextText).not.toContain('big.md');
  });

  it('counts separators when enforcing max context length', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'first',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'a'.repeat(11),
        filename: 'a.md',
        title: null,
        sourceLabel: null,
        score: 0.9,
      },
      {
        id: 'second',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 1,
        content: 'b'.repeat(13),
        filename: 'b.md',
        title: null,
        sourceLabel: null,
        score: 0.9,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: 'anything' });
    expect(result.contextText.length).toBeLessThanOrEqual(120);
    expect(result.contextText).toContain('a.md');
    expect(result.contextText).not.toContain('b.md');
    expect(result.matches).toEqual([expect.objectContaining({ chunkId: 'first' })]);
  });

  it('sanitizes filenames in source markers', async () => {
    embedQueryMock.mockResolvedValueOnce([0.1]);
    searchMock.mockResolvedValueOnce([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'ok',
        filename: 'bad"\nname.md',
        title: null,
        sourceLabel: null,
        score: 0.9,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('@/lib/rag/knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({ userId: 'u1', query: 'anything' });
    expect(result.contextText).toContain('[knowledge source filename="bad name.md" chunkIndex=0]');
  });
});
