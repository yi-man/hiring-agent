/** @jest-environment node */

export {};

const embedDocumentsMock = jest.fn();
const splitMarkdownToChunksMock = jest.fn();
const upsertCandidateWithIdentityMock = jest.fn();
const createOrReuseCandidateResumeMock = jest.fn();
const findCandidateByIdentityMock = jest.fn();
const findCandidateResumeByHashMock = jest.fn();
const replaceCandidateResumeChunksMock = jest.fn();

jest.mock('@/lib/env', () => ({
  env: {
    EMBEDDING_MODEL: 'text-embedding-v3',
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  },
}));

jest.mock('@/lib/rag/embed', () => ({
  embedDocuments: (...args: unknown[]) => embedDocumentsMock(...args),
  getConfiguredEmbeddingModel: () => 'text-embedding-v3',
}));

jest.mock('@/lib/rag/markdown', () => ({
  splitMarkdownToChunks: (...args: unknown[]) => splitMarkdownToChunksMock(...args),
}));

jest.mock('./repo', () => ({
  upsertCandidateWithIdentity: (...args: unknown[]) => upsertCandidateWithIdentityMock(...args),
  createOrReuseCandidateResume: (...args: unknown[]) => createOrReuseCandidateResumeMock(...args),
  findCandidateByIdentity: (...args: unknown[]) => findCandidateByIdentityMock(...args),
  findCandidateResumeByHash: (...args: unknown[]) => findCandidateResumeByHashMock(...args),
  replaceCandidateResumeChunks: (...args: unknown[]) => replaceCandidateResumeChunksMock(...args),
}));

const rawCandidate = {
  platformCandidateId: 'boss-1',
  name: '王小明',
  title: 'Java Engineer',
  company: 'Acme',
  location: 'Shanghai',
  experienceYears: 5,
  resumeText: ' Java Spring Boot ',
  profileUrl: 'https://example.test/candidates/boss-1',
  lastActiveAt: '2026-06-01T00:00:00.000Z',
};

const optionalUpsertKeys = [
  'currentTitle',
  'currentCompany',
  'location',
  'experienceYears',
  'platformCandidateId',
  'profileUrl',
  'lastActiveAt',
] as const;

function getUpsertPayload(): Record<string, unknown> {
  return upsertCandidateWithIdentityMock.mock.calls[0][0] as Record<string, unknown>;
}

function hasOwnKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

describe('ingestRawCandidate', () => {
  beforeEach(() => {
    embedDocumentsMock.mockReset();
    splitMarkdownToChunksMock.mockReset();
    upsertCandidateWithIdentityMock.mockReset();
    createOrReuseCandidateResumeMock.mockReset();
    findCandidateByIdentityMock.mockReset();
    findCandidateResumeByHashMock.mockReset();
    replaceCandidateResumeChunksMock.mockReset();

    findCandidateByIdentityMock.mockResolvedValue(null);
    findCandidateResumeByHashMock.mockResolvedValue(null);
    upsertCandidateWithIdentityMock.mockResolvedValue({
      id: 'candidate-1',
      identityHash: 'identity-hash-1',
      displayName: '王小明',
      contacted: false,
    });
    createOrReuseCandidateResumeMock.mockResolvedValue({
      id: 'resume-1',
      resumeHash: 'resume-hash-1',
    });
    splitMarkdownToChunksMock.mockResolvedValue([{ index: 0, content: 'Java Spring Boot' }]);
    embedDocumentsMock.mockResolvedValue([[0.1, 0.2, 0.3]]);
    replaceCandidateResumeChunksMock.mockResolvedValue(1);
  });

  it('upserts candidate, stores resume snapshot, embeds chunks, and writes vectors', async () => {
    const { ingestRawCandidate } = await import('./ingest');

    const result = await ingestRawCandidate({
      userId: 'u1',
      sourcePlatform: 'boss-like',
      rawCandidate,
    });

    expect(upsertCandidateWithIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        displayName: '王小明',
      }),
    );
    expect(createOrReuseCandidateResumeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        candidateId: 'candidate-1',
        sourcePlatform: 'boss-like',
        rawText: 'Java Spring Boot',
      }),
    );
    expect(splitMarkdownToChunksMock).toHaveBeenCalledWith('Java Spring Boot');
    expect(embedDocumentsMock).toHaveBeenCalledWith(['Java Spring Boot']);
    expect(replaceCandidateResumeChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingModel: 'text-embedding-v3',
        chunks: [
          expect.objectContaining({
            chunkIndex: 0,
            content: 'Java Spring Boot',
            embedding: [0.1, 0.2, 0.3],
          }),
        ],
      }),
    );
    expect(result).toEqual({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: expect.any(String),
      chunkCount: 1,
      candidateContacted: false,
      candidateWasExisting: false,
      resumeWasExisting: false,
      existingCandidateId: null,
      existingCandidateName: null,
      existingResumeId: null,
    });
  });

  it('rejects empty resume text before calling embeddings', async () => {
    const { ingestRawCandidate } = await import('./ingest');

    await expect(
      ingestRawCandidate({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        rawCandidate: { ...rawCandidate, resumeText: '   ' },
      }),
    ).rejects.toThrow('resume text must not be empty');

    expect(upsertCandidateWithIdentityMock).not.toHaveBeenCalled();
    expect(embedDocumentsMock).not.toHaveBeenCalled();
    expect(replaceCandidateResumeChunksMock).not.toHaveBeenCalled();
  });

  it('omits absent optional candidate fields from upsert payload', async () => {
    const { ingestRawCandidate } = await import('./ingest');

    await ingestRawCandidate({
      userId: 'u1',
      sourcePlatform: 'boss-like',
      rawCandidate: {
        name: '王小明',
        resumeText: 'Java Spring Boot',
      },
    });

    const payload = getUpsertPayload();
    for (const key of optionalUpsertKeys) {
      expect(hasOwnKey(payload, key)).toBe(false);
    }
  });

  it('preserves explicit null optional candidate fields in upsert payload', async () => {
    const { ingestRawCandidate } = await import('./ingest');

    await ingestRawCandidate({
      userId: 'u1',
      sourcePlatform: 'boss-like',
      rawCandidate: {
        ...rawCandidate,
        title: null,
        profileUrl: null,
      },
    });

    expect(upsertCandidateWithIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTitle: null,
        profileUrl: null,
      }),
    );
  });

  it('normalizes invalid last active timestamps to null', async () => {
    const { ingestRawCandidate } = await import('./ingest');

    await ingestRawCandidate({
      userId: 'u1',
      sourcePlatform: 'boss-like',
      rawCandidate: { ...rawCandidate, lastActiveAt: '刚刚活跃' },
    });

    expect(upsertCandidateWithIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lastActiveAt: null,
      }),
    );
  });

  it('rejects mismatched embedding counts', async () => {
    splitMarkdownToChunksMock.mockResolvedValueOnce([
      { index: 0, content: 'Java Spring Boot' },
      { index: 1, content: 'Kafka Redis' },
    ]);
    embedDocumentsMock.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    const { ingestRawCandidate } = await import('./ingest');

    await expect(
      ingestRawCandidate({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        rawCandidate,
      }),
    ).rejects.toThrow('embedding count does not match resume chunks');

    expect(replaceCandidateResumeChunksMock).not.toHaveBeenCalled();
  });

  it('returns existing resume when raw text hash is unchanged', async () => {
    createOrReuseCandidateResumeMock.mockResolvedValueOnce({
      id: 'resume-existing',
      resumeHash: 'same-hash',
    });
    const { ingestRawCandidate } = await import('./ingest');

    const result = await ingestRawCandidate({
      userId: 'u1',
      sourcePlatform: 'boss-like',
      rawCandidate,
    });

    expect(result.resumeId).toBe('resume-existing');
    expect(replaceCandidateResumeChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeId: 'resume-existing',
      }),
    );
  });

  it('reports when candidate and resume were already present in the library', async () => {
    findCandidateByIdentityMock.mockResolvedValueOnce({
      id: 'candidate-existing',
      displayName: '王小明',
    });
    upsertCandidateWithIdentityMock.mockResolvedValueOnce({
      id: 'candidate-existing',
      identityHash: 'identity-hash-existing',
      displayName: '王小明',
      contacted: true,
    });
    findCandidateResumeByHashMock.mockResolvedValueOnce({
      id: 'resume-existing',
      resumeHash: 'same-hash',
    });
    createOrReuseCandidateResumeMock.mockResolvedValueOnce({
      id: 'resume-existing',
      resumeHash: 'same-hash',
    });
    const { ingestRawCandidate } = await import('./ingest');

    const result = await ingestRawCandidate({
      userId: 'u1',
      sourcePlatform: 'boss-like',
      rawCandidate,
    });

    expect(findCandidateByIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        identityHash: expect.any(String),
      }),
    );
    expect(findCandidateResumeByHashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        candidateId: 'candidate-existing',
        resumeHash: expect.any(String),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        candidateId: 'candidate-existing',
        resumeId: 'resume-existing',
        chunkCount: 0,
        candidateContacted: true,
        candidateWasExisting: true,
        resumeWasExisting: true,
        existingCandidateId: 'candidate-existing',
        existingCandidateName: '王小明',
        existingResumeId: 'resume-existing',
      }),
    );
    expect(createOrReuseCandidateResumeMock).not.toHaveBeenCalled();
    expect(splitMarkdownToChunksMock).not.toHaveBeenCalled();
    expect(embedDocumentsMock).not.toHaveBeenCalled();
    expect(replaceCandidateResumeChunksMock).not.toHaveBeenCalled();
  });

  it('rejects empty embedding vectors before writing vectors', async () => {
    embedDocumentsMock.mockResolvedValueOnce([[]]);
    const { ingestRawCandidate } = await import('./ingest');

    await expect(
      ingestRawCandidate({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        rawCandidate,
      }),
    ).rejects.toThrow('embedding vectors are empty');

    expect(replaceCandidateResumeChunksMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched embedding vector dimensions before writing vectors', async () => {
    splitMarkdownToChunksMock.mockResolvedValueOnce([
      { index: 0, content: 'Java Spring Boot' },
      { index: 1, content: 'Kafka Redis' },
    ]);
    embedDocumentsMock.mockResolvedValueOnce([
      [0.1, 0.2, 0.3],
      [0.4, 0.5],
    ]);
    const { ingestRawCandidate } = await import('./ingest');

    await expect(
      ingestRawCandidate({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        rawCandidate,
      }),
    ).rejects.toThrow('embedding vector dimensions do not match');

    expect(replaceCandidateResumeChunksMock).not.toHaveBeenCalled();
  });
});
