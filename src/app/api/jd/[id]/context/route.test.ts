/**
 * @jest-environment node
 */
import { GET } from './route';
import { getJobDescriptionContext } from '@/lib/jd/context';

const requireAuthMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

jest.mock('@/lib/jd/context', () => ({
  getJobDescriptionContext: jest.fn(),
}));

const getContextMock = getJobDescriptionContext as jest.MockedFunction<
  typeof getJobDescriptionContext
>;

describe('/api/jd/[id]/context', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getContextMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns the hydrated JD generation context', async () => {
    getContextMock.mockResolvedValueOnce({
      jobDescription: {
        id: 'jd-1',
        department: '技术部',
        position: '内容社区增长前端工程师',
        updatedAt: '2026-07-10T08:00:00.000Z',
      },
      context: {
        used: true,
        query: '内容社区 推荐策略',
        textLength: 80,
        contextText: '[knowledge source filename="company.md" chunkIndex=3]\n内容与社区业务群',
        warnings: [],
        selection: {
          candidateTopK: 12,
          candidateCount: 6,
          selectedCount: 1,
          maxChunks: 6,
          maxDocuments: 3,
          maxChunksPerDocument: 3,
          minScore: 0,
          maxContextChars: 6000,
          excludedByLowScore: 0,
          excludedByEmptyContent: 0,
          excludedByDocumentLimit: 0,
          excludedByPerDocumentLimit: 0,
          excludedByRedundancy: 0,
          excludedByContextLength: 0,
        },
        matches: [
          {
            score: 0.91,
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            chunkIndex: 3,
            filename: 'company.md',
            title: '公司手册',
            sourceLabel: 'company',
            content: '内容与社区业务群',
            selectedRank: 1,
            reason: '语义相似度 0.91，符合知识库选入规则',
          },
        ],
      },
    });

    const response = await GET(new Request('http://localhost/api/jd/jd-1/context'), {
      params: Promise.resolve({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.context.matches[0].content).toBe('内容与社区业务群');
    expect(getContextMock).toHaveBeenCalledWith('u1', 'jd-1');
  });

  it('returns 404 when the JD does not exist', async () => {
    getContextMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/jd/missing/context'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('job description context not found');
  });
});
