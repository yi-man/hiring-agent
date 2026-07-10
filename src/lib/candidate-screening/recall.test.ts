/** @jest-environment node */

export {};

const embedQueryMock = jest.fn();
const searchCandidateResumeChunksMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    EMBEDDING_MODEL: 'text-embedding-v3',
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedQuery: (...args: unknown[]) => embedQueryMock(...args),
  getConfiguredEmbeddingModel: () => 'text-embedding-v3',
}));

jest.mock('./repo', () => ({
  searchCandidateResumeChunks: (...args: unknown[]) => searchCandidateResumeChunksMock(...args),
}));

describe('recallCandidatesForJd', () => {
  beforeEach(() => {
    embedQueryMock.mockReset();
    searchCandidateResumeChunksMock.mockReset();
    embedQueryMock.mockResolvedValue([0.1, 0.2, 0.3]);
    searchCandidateResumeChunksMock.mockResolvedValue([
      {
        id: 'chunk-1',
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'Java Spring Boot',
        displayName: '王小明',
        currentTitle: 'Java Engineer',
        currentCompany: 'Acme',
        profileUrl: 'https://example.test/candidates/boss-1',
        score: 0.91,
      },
    ]);
  });

  it('embeds the JD retrieval query and searches candidate resume chunks', async () => {
    const { recallCandidatesForJd } = await import('./recall');

    const result = await recallCandidatesForJd({
      userId: 'u1',
      retrievalQuery: ' Java Spring Boot ',
      topK: 5,
      allowAlreadyContacted: false,
    });

    expect(embedQueryMock).toHaveBeenCalledWith('Java Spring Boot');
    expect(searchCandidateResumeChunksMock).toHaveBeenCalledWith({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-v3',
      topK: 5,
      allowAlreadyContacted: false,
    });
    expect(result).toEqual([
      expect.objectContaining({
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        score: 0.91,
      }),
    ]);
  });

  it('returns empty results when retrieval query is blank', async () => {
    const { recallCandidatesForJd } = await import('./recall');

    await expect(
      recallCandidatesForJd({
        userId: 'u1',
        retrievalQuery: '   ',
        topK: 5,
        allowAlreadyContacted: false,
      }),
    ).resolves.toEqual([]);

    expect(embedQueryMock).not.toHaveBeenCalled();
    expect(searchCandidateResumeChunksMock).not.toHaveBeenCalled();
  });

  it('passes allowAlreadyContacted to repository search', async () => {
    const { recallCandidatesForJd } = await import('./recall');

    await recallCandidatesForJd({
      userId: 'u1',
      retrievalQuery: 'Java',
      topK: 3,
      allowAlreadyContacted: true,
    });

    expect(searchCandidateResumeChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowAlreadyContacted: true,
      }),
    );
  });
});
