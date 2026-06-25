const claimMock = jest.fn();
const completeMock = jest.fn();
const failMock = jest.fn();
const getDocMock = jest.fn();
const replaceChunksMock = jest.fn();
const splitMock = jest.fn();
const embedDocumentsMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    RAG_INGEST_LEASE_MS: 1800000,
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  },
}));

jest.mock('@/lib/chat/repositories/document-repo', () => ({}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  claimKnowledgeDocumentIngest: (...args: unknown[]) => claimMock(...args),
  completeKnowledgeDocumentIngest: (...args: unknown[]) => completeMock(...args),
  failKnowledgeDocumentIngest: (...args: unknown[]) => failMock(...args),
  getKnowledgeDocumentById: (...args: unknown[]) => getDocMock(...args),
  replaceKnowledgeDocumentChunks: (...args: unknown[]) => replaceChunksMock(...args),
}));

jest.mock('@/lib/rag/markdown', () => ({
  splitMarkdownToChunks: (...args: unknown[]) => splitMock(...args),
}));

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
}));

describe('ingestKnowledgeDocument', () => {
  beforeEach(() => {
    claimMock.mockReset();
    completeMock.mockReset();
    failMock.mockReset();
    getDocMock.mockReset();
    replaceChunksMock.mockReset();
    splitMock.mockReset();
    embedDocumentsMock.mockReset();
    completeMock.mockResolvedValue(true);
    failMock.mockResolvedValue(true);
    replaceChunksMock.mockResolvedValue(1);
  });

  it('splits, embeds, writes chunks, and marks ready', async () => {
    claimMock.mockResolvedValueOnce({ id: 'doc-1' });
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      userId: 'u1',
      contentMarkdown: '# A',
      version: 1,
    });
    splitMock.mockResolvedValueOnce([{ index: 0, content: 'Alpha chunk' }]);
    embedDocumentsMock.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' });

    expect(embedDocumentsMock).toHaveBeenCalledWith(['Alpha chunk']);
    expect(replaceChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        userId: 'u1',
        embeddingModel: 'text-embedding-3-small',
        chunks: [
          expect.objectContaining({
            chunkIndex: 0,
            content: 'Alpha chunk',
            embedding: [0.1, 0.2, 0.3],
          }),
        ],
      }),
    );
    expect(completeMock).toHaveBeenCalledWith('u1', 'doc-1', expect.stringMatching(/^ingest:/));
  });

  it('marks failed when embedding throws', async () => {
    claimMock.mockResolvedValueOnce({ id: 'doc-1' });
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      userId: 'u1',
      contentMarkdown: '# A',
    });
    splitMock.mockResolvedValueOnce([{ index: 0, content: 'Alpha chunk' }]);
    embedDocumentsMock.mockRejectedValueOnce(new Error('embedding down'));

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await expect(ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' })).rejects.toThrow(
      'embedding down',
    );
    expect(failMock).toHaveBeenCalledWith(
      'u1',
      'doc-1',
      expect.stringMatching(/^ingest:/),
      'embedding down',
    );
  });

  it('throws when embedding count does not match chunks', async () => {
    claimMock.mockResolvedValueOnce({ id: 'doc-1' });
    getDocMock.mockResolvedValueOnce({
      id: 'doc-1',
      userId: 'u1',
      contentMarkdown: '# A',
    });
    splitMock.mockResolvedValueOnce([
      { index: 0, content: 'A' },
      { index: 1, content: 'B' },
    ]);
    embedDocumentsMock.mockResolvedValueOnce([[0.1, 0.2]]);

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await expect(ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' })).rejects.toThrow(
      'embedding count does not match knowledge chunks',
    );
  });

  it('returns when a document is already ready', async () => {
    claimMock.mockResolvedValueOnce(null);
    getDocMock.mockResolvedValueOnce({ id: 'doc-1', status: 'ready' });

    const { ingestKnowledgeDocument } = await import('@/lib/rag/knowledge-ingest');
    await expect(
      ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' }),
    ).resolves.toBeUndefined();
    expect(embedDocumentsMock).not.toHaveBeenCalled();
  });
});
