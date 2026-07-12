/** @jest-environment node */

export {};

const embedQueryMock = jest.fn();
const hasReadyKnowledgeDocumentsMock = jest.fn();
const listKnowledgeDocumentsMock = jest.fn();
const searchKnowledgeDocumentChunksMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    EMBEDDING_MODEL: 'text-embedding-v3',
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    RAG_CONTEXT_MAX_CHARS: 6000,
    RAG_MIN_SCORE: 0,
    RAG_TOP_K: 6,
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedQuery: (...args: unknown[]) => embedQueryMock(...args),
  getConfiguredEmbeddingModel: () => 'text-embedding-v3',
}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  hasReadyKnowledgeDocuments: (...args: unknown[]) => hasReadyKnowledgeDocumentsMock(...args),
  listKnowledgeDocuments: (...args: unknown[]) => listKnowledgeDocumentsMock(...args),
  searchKnowledgeDocumentChunks: (...args: unknown[]) => searchKnowledgeDocumentChunksMock(...args),
}));

describe('retrieveUserKnowledgeContext', () => {
  beforeEach(() => {
    embedQueryMock.mockReset();
    hasReadyKnowledgeDocumentsMock.mockReset();
    listKnowledgeDocumentsMock.mockReset();
    searchKnowledgeDocumentChunksMock.mockReset();

    embedQueryMock.mockResolvedValue([0.1, 0.2, 0.3]);
    hasReadyKnowledgeDocumentsMock.mockResolvedValue(true);
    searchKnowledgeDocumentChunksMock.mockResolvedValue([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 3,
        content: '内容与社区业务群负责短视频、直播、创作者生态和内容推荐策略。',
        filename: 'company.md',
        title: '公司招聘手册',
        sourceLabel: 'company-handbook',
        score: 0.91,
      },
    ]);
  });

  it('searches knowledge chunks with the configured embedding model used by query embedding', async () => {
    const { retrieveUserKnowledgeContext } = await import('./knowledge-retrieval');

    const result = await retrieveUserKnowledgeContext({
      userId: 'u1',
      query: ' 内容社区 推荐策略 ',
      topK: 4,
    });

    expect(embedQueryMock).toHaveBeenCalledWith('内容社区 推荐策略');
    expect(searchKnowledgeDocumentChunksMock).toHaveBeenCalledWith({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-v3',
      topK: 4,
      documentId: null,
    });
    expect(result.contextText).toContain('[knowledge source filename="company.md" chunkIndex=3]');
    expect(result.contextText).toContain('内容与社区业务群');
    expect(result.matches).toEqual([
      expect.objectContaining({
        documentId: 'doc-1',
        content: '内容与社区业务群负责短视频、直播、创作者生态和内容推荐策略。',
        filename: 'company.md',
        reason: '语义相似度 0.91，符合知识库选入规则',
        score: 0.91,
        selectedRank: 1,
      }),
    ]);
    expect(result.selection).toEqual(
      expect.objectContaining({
        candidateTopK: 4,
        maxChunks: 6,
        maxDocuments: 3,
        maxChunksPerDocument: 3,
        selectedCount: 1,
      }),
    );
  });

  it('limits selected context to six chunks, three documents, and three chunks per document', async () => {
    const rows = [
      ['doc-1', 10, 0.99],
      ['doc-1', 12, 0.98],
      ['doc-1', 14, 0.97],
      ['doc-1', 16, 0.96],
      ['doc-2', 20, 0.95],
      ['doc-2', 22, 0.94],
      ['doc-2', 24, 0.93],
      ['doc-3', 30, 0.92],
      ['doc-4', 40, 0.91],
    ].map(([documentId, chunkIndex, score]) => ({
      id: `${documentId}-chunk-${chunkIndex}`,
      documentId,
      userId: 'u1',
      chunkIndex,
      content: `${documentId} 的第 ${chunkIndex} 段招聘上下文`,
      filename: `${documentId}.md`,
      title: `${documentId} 手册`,
      sourceLabel: documentId,
      score,
    }));
    searchKnowledgeDocumentChunksMock.mockResolvedValueOnce(rows);

    const { retrieveUserKnowledgeContext, KNOWLEDGE_CONTEXT_SELECTION_POLICY } =
      await import('./knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({
      userId: 'u1',
      query: '内容社区增长前端',
    });

    expect(searchKnowledgeDocumentChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topK: KNOWLEDGE_CONTEXT_SELECTION_POLICY.candidateTopK,
      }),
    );
    expect(result.matches).toHaveLength(6);
    expect(new Set(result.matches.map((match) => match.documentId)).size).toBeLessThanOrEqual(3);
    expect(
      Math.max(
        ...Array.from(
          result.matches
            .reduce((counts, match) => {
              counts.set(match.documentId, (counts.get(match.documentId) ?? 0) + 1);
              return counts;
            }, new Map<string, number>())
            .values(),
        ),
      ),
    ).toBeLessThanOrEqual(3);
    expect(result.matches.map((match) => match.chunkId)).toEqual([
      'doc-1-chunk-10',
      'doc-1-chunk-12',
      'doc-1-chunk-14',
      'doc-2-chunk-20',
      'doc-2-chunk-22',
      'doc-2-chunk-24',
    ]);
    expect(result.selection).toEqual(
      expect.objectContaining({
        candidateCount: 9,
        selectedCount: 6,
        excludedByPerDocumentLimit: 1,
      }),
    );
  });

  it('skips adjacent chunks from the same document to reduce repeated context', async () => {
    searchKnowledgeDocumentChunksMock.mockResolvedValueOnce([
      {
        id: 'chunk-10',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 10,
        content: '内容社区业务介绍和推荐策略协作方式。',
        filename: 'company.md',
        title: '公司手册',
        sourceLabel: 'company',
        score: 0.95,
      },
      {
        id: 'chunk-11',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 11,
        content: '内容社区业务介绍和推荐策略协作方式的延续说明。',
        filename: 'company.md',
        title: '公司手册',
        sourceLabel: 'company',
        score: 0.94,
      },
      {
        id: 'chunk-14',
        documentId: 'doc-1',
        userId: 'u1',
        chunkIndex: 14,
        content: '创作者生态工具和增长实验看板建设。',
        filename: 'company.md',
        title: '公司手册',
        sourceLabel: 'company',
        score: 0.93,
      },
    ]);

    const { retrieveUserKnowledgeContext } = await import('./knowledge-retrieval');
    const result = await retrieveUserKnowledgeContext({
      userId: 'u1',
      query: '内容社区 推荐 创作者生态',
    });

    expect(result.matches.map((match) => match.chunkId)).toEqual(['chunk-10', 'chunk-14']);
    expect(result.contextText).not.toContain('延续说明');
    expect(result.selection).toEqual(
      expect.objectContaining({
        excludedByRedundancy: 1,
        selectedCount: 2,
      }),
    );
  });
});
