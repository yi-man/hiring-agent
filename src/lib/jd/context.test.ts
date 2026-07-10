/** @jest-environment node */

export {};

const getJobDescriptionByIdMock = jest.fn();
const listKnowledgeDocumentChunksByIdsMock = jest.fn();

jest.mock('@/lib/jd/job-description-repo', () => ({
  getJobDescriptionById: (...args: unknown[]) => getJobDescriptionByIdMock(...args),
}));

jest.mock('@/lib/rag/knowledge-repo', () => ({
  listKnowledgeDocumentChunksByIds: (...args: unknown[]) =>
    listKnowledgeDocumentChunksByIdsMock(...args),
}));

describe('getJobDescriptionContext', () => {
  beforeEach(() => {
    getJobDescriptionByIdMock.mockReset();
    listKnowledgeDocumentChunksByIdsMock.mockReset();
  });

  it('hydrates old JD context matches with knowledge chunk content', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '内容社区增长前端工程师',
      updatedAt: '2026-07-10T08:00:00.000Z',
      generationMeta: {
        context: {
          used: true,
          query: '内容社区 推荐策略',
          textLength: 120,
          matches: [
            {
              score: 0.91,
              documentId: 'doc-1',
              chunkId: 'chunk-1',
              chunkIndex: 3,
              filename: 'company.md',
              title: '公司手册',
              sourceLabel: 'company',
            },
          ],
          warnings: [],
        },
      },
    });
    listKnowledgeDocumentChunksByIdsMock.mockResolvedValueOnce([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        chunkIndex: 3,
        content: '内容与社区业务群负责短视频、直播、创作者生态和推荐策略。',
        filename: 'company.md',
        title: '公司手册',
        sourceLabel: 'company',
      },
    ]);

    const { getJobDescriptionContext } = await import('./context');
    const result = await getJobDescriptionContext('u1', 'jd-1');

    expect(result?.jobDescription).toEqual({
      id: 'jd-1',
      department: '技术部',
      position: '内容社区增长前端工程师',
      updatedAt: '2026-07-10T08:00:00.000Z',
    });
    expect(listKnowledgeDocumentChunksByIdsMock).toHaveBeenCalledWith('u1', ['chunk-1']);
    expect(result?.context.matches).toEqual([
      expect.objectContaining({
        chunkId: 'chunk-1',
        content: '内容与社区业务群负责短视频、直播、创作者生态和推荐策略。',
        reason: '本次生成选入的知识库片段',
        selectedRank: 1,
      }),
    ]);
    expect(result?.context.contextText).toContain(
      '[knowledge source filename="company.md" chunkIndex=3]',
    );
    expect(result?.context.selection).toEqual(
      expect.objectContaining({
        maxChunks: 6,
        maxDocuments: 3,
        maxChunksPerDocument: 3,
        selectedCount: 1,
      }),
    );
  });

  it('returns null when the JD is not owned by the user', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(null);

    const { getJobDescriptionContext } = await import('./context');
    const result = await getJobDescriptionContext('u1', 'missing');

    expect(result).toBeNull();
    expect(listKnowledgeDocumentChunksByIdsMock).not.toHaveBeenCalled();
  });
});
