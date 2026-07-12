/** @jest-environment node */

export {};

const claimKnowledgeDocumentIngestMock = jest.fn();
const embedDocumentsMock = jest.fn();
const failKnowledgeDocumentIngestMock = jest.fn();
const getKnowledgeDocumentByIdMock = jest.fn();
const replaceAndCompleteKnowledgeDocumentIngestMock = jest.fn();
const splitMarkdownToChunksMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    EMBEDDING_MODEL: 'text-embedding-v3',
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    RAG_INGEST_LEASE_MS: 1800000,
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
  getConfiguredEmbeddingModel: () => 'text-embedding-v3',
}));

jest.mock('@/lib/rag/markdown', () => ({
  splitMarkdownToChunks: (...args: unknown[]) => splitMarkdownToChunksMock(...args),
}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  claimKnowledgeDocumentIngest: (...args: unknown[]) => claimKnowledgeDocumentIngestMock(...args),
  failKnowledgeDocumentIngest: (...args: unknown[]) => failKnowledgeDocumentIngestMock(...args),
  getKnowledgeDocumentById: (...args: unknown[]) => getKnowledgeDocumentByIdMock(...args),
  replaceAndCompleteKnowledgeDocumentIngest: (...args: unknown[]) =>
    replaceAndCompleteKnowledgeDocumentIngestMock(...args),
}));

describe('ingestKnowledgeDocument', () => {
  beforeEach(() => {
    claimKnowledgeDocumentIngestMock.mockReset();
    embedDocumentsMock.mockReset();
    failKnowledgeDocumentIngestMock.mockReset();
    getKnowledgeDocumentByIdMock.mockReset();
    replaceAndCompleteKnowledgeDocumentIngestMock.mockReset();
    splitMarkdownToChunksMock.mockReset();

    claimKnowledgeDocumentIngestMock.mockResolvedValue({
      id: 'doc-1',
      userId: 'u1',
      status: 'processing',
    });
    getKnowledgeDocumentByIdMock.mockResolvedValue({
      id: 'doc-1',
      userId: 'u1',
      status: 'processing',
      contentMarkdown: '# 公司手册\n内容与社区业务群负责内容推荐策略。',
    });
    splitMarkdownToChunksMock.mockResolvedValue([
      { index: 0, content: '内容与社区业务群负责内容推荐策略。' },
    ]);
    embedDocumentsMock.mockResolvedValue([[0.1, 0.2, 0.3]]);
    replaceAndCompleteKnowledgeDocumentIngestMock.mockResolvedValue(true);
  });

  it('stores chunks with the same configured embedding model used for document embeddings', async () => {
    const { ingestKnowledgeDocument } = await import('./knowledge-ingest');

    await ingestKnowledgeDocument({ userId: 'u1', documentId: 'doc-1' });

    expect(embedDocumentsMock).toHaveBeenCalledWith(['内容与社区业务群负责内容推荐策略。']);
    expect(replaceAndCompleteKnowledgeDocumentIngestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        documentId: 'doc-1',
        embeddingModel: 'text-embedding-v3',
        chunks: [
          expect.objectContaining({
            chunkIndex: 0,
            content: '内容与社区业务群负责内容推荐策略。',
            embedding: [0.1, 0.2, 0.3],
          }),
        ],
      }),
    );
  });
});
