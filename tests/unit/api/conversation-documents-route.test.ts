import {
  GET as getDocuments,
  POST as postDocument,
} from '@/app/api/conversations/[id]/documents/route';
import {
  DELETE as deleteDocument,
  GET as getDocumentDetail,
} from '@/app/api/conversations/[id]/documents/[documentId]/route';

const requireAuthMock = jest.fn();
const conversationFindFirstMock = jest.fn();
const createConversationDocumentMock = jest.fn();
const listConversationDocumentsMock = jest.fn();
const getConversationDocumentByIdMock = jest.fn();
const deleteConversationDocumentMock = jest.fn();
const ingestConversationDocumentMock = jest.fn();
const createConversationDocumentIndexJobMock = jest.fn();
const markConversationDocumentIndexJobRunningMock = jest.fn();
const markConversationDocumentIndexJobSuccessMock = jest.fn();
const markConversationDocumentIndexJobFailedMock = jest.fn();
const deleteDocumentPointsMock = jest.fn();

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
    }
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirstMock(...args),
    },
  },
}));

jest.mock('@/lib/chat/repositories/document-repo', () => ({
  createConversationDocument: (...args: unknown[]) => createConversationDocumentMock(...args),
  listConversationDocuments: (...args: unknown[]) => listConversationDocumentsMock(...args),
  getConversationDocumentById: (...args: unknown[]) => getConversationDocumentByIdMock(...args),
  deleteConversationDocument: (...args: unknown[]) => deleteConversationDocumentMock(...args),
  createConversationDocumentIndexJob: (...args: unknown[]) =>
    createConversationDocumentIndexJobMock(...args),
  markConversationDocumentIndexJobRunning: (...args: unknown[]) =>
    markConversationDocumentIndexJobRunningMock(...args),
  markConversationDocumentIndexJobSuccess: (...args: unknown[]) =>
    markConversationDocumentIndexJobSuccessMock(...args),
  markConversationDocumentIndexJobFailed: (...args: unknown[]) =>
    markConversationDocumentIndexJobFailedMock(...args),
}));

jest.mock('@/lib/rag/ingest', () => ({
  ingestConversationDocument: (...args: unknown[]) => ingestConversationDocumentMock(...args),
}));

jest.mock('@/lib/rag/qdrant', () => ({
  deleteDocumentPoints: (...args: unknown[]) => deleteDocumentPointsMock(...args),
}));

describe('conversation documents routes', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    conversationFindFirstMock.mockReset();
    createConversationDocumentMock.mockReset();
    listConversationDocumentsMock.mockReset();
    getConversationDocumentByIdMock.mockReset();
    deleteConversationDocumentMock.mockReset();
    ingestConversationDocumentMock.mockReset();
    createConversationDocumentIndexJobMock.mockReset();
    markConversationDocumentIndexJobRunningMock.mockReset();
    markConversationDocumentIndexJobSuccessMock.mockReset();
    markConversationDocumentIndexJobFailedMock.mockReset();
    deleteDocumentPointsMock.mockReset();
    ingestConversationDocumentMock.mockResolvedValue(undefined);
    createConversationDocumentIndexJobMock.mockResolvedValue({ id: 'job-1' });
    markConversationDocumentIndexJobRunningMock.mockResolvedValue({
      id: 'job-1',
      status: 'running',
    });
    markConversationDocumentIndexJobSuccessMock.mockResolvedValue({
      id: 'job-1',
      status: 'success',
    });
    markConversationDocumentIndexJobFailedMock.mockResolvedValue({ id: 'job-1', status: 'failed' });
    deleteDocumentPointsMock.mockResolvedValue(undefined);
  });

  it('returns 401 when uploading without auth', async () => {
    const error = new Error('Unauthorized') as Error & { status?: number; name?: string };
    error.name = 'UnauthorizedError';
    error.status = 401;
    requireAuthMock.mockRejectedValueOnce(error);

    const res = await postDocument({ formData: async () => new FormData() } as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Unauthorized');
  });

  it('returns 404 when owner does not own conversation on list', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce(null);

    const res = await getDocuments({} as Request, {
      params: Promise.resolve({ id: 'c-not-owned' }),
    });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toContain('conversation not found');
  });

  it('rejects non-markdown files', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    const formData = new FormData();
    formData.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    const res = await postDocument({ formData: async () => formData } as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('.md');
  });

  it('rejects empty markdown file', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    const formData = new FormData();
    formData.set('file', new File([''], 'notes.md', { type: 'text/markdown' }));

    const res = await postDocument({ formData: async () => formData } as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('must not be empty');
  });

  it('rejects oversized markdown file', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    const formData = new FormData();
    formData.set('file', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'notes.md'));

    const res = await postDocument({ formData: async () => formData } as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(413);
    expect(body.error).toContain('5MB');
  });

  it('creates markdown document successfully', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    createConversationDocumentMock.mockResolvedValueOnce({
      id: 'd1',
      conversationId: 'c1',
      filename: 'notes.md',
      contentMarkdown: '# hello',
      status: 'processing',
    });
    const formData = {
      get: () =>
        ({
          name: 'notes.md',
          size: 7,
          text: async () => '# hello',
        }) as FormDataEntryValue,
    };

    getConversationDocumentByIdMock.mockResolvedValueOnce({
      id: 'd1',
      conversationId: 'c1',
      filename: 'notes.md',
      contentMarkdown: '# hello',
      status: 'ready',
      errorMessage: null,
      version: 1,
    });

    const res = await postDocument({ formData: async () => formData } as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.document.id).toBe('d1');
    expect(body.document.status).toBe('ready');
    expect(getConversationDocumentByIdMock).toHaveBeenCalledWith('c1', 'd1');
    expect(createConversationDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        filename: 'notes.md',
        contentMarkdown: '# hello',
        status: 'processing',
      }),
    );
    expect(createConversationDocumentIndexJobMock).toHaveBeenCalledWith('d1');
    expect(markConversationDocumentIndexJobRunningMock).toHaveBeenCalledWith('job-1');
    expect(ingestConversationDocumentMock).toHaveBeenCalledWith('d1', 'c1');
    expect(markConversationDocumentIndexJobSuccessMock).toHaveBeenCalledWith('job-1');
    expect(markConversationDocumentIndexJobFailedMock).not.toHaveBeenCalled();
  });

  it('marks index job failed when ingest fails', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    createConversationDocumentMock.mockResolvedValueOnce({
      id: 'd1',
      conversationId: 'c1',
      filename: 'notes.md',
      contentMarkdown: '# hello',
      status: 'processing',
    });
    ingestConversationDocumentMock.mockRejectedValueOnce(new Error('ingest crash'));
    getConversationDocumentByIdMock.mockResolvedValueOnce({
      id: 'd1',
      conversationId: 'c1',
      filename: 'notes.md',
      contentMarkdown: '# hello',
      status: 'failed',
      errorMessage: 'ingest crash',
      version: 1,
    });
    const formData = {
      get: () =>
        ({
          name: 'notes.md',
          size: 7,
          text: async () => '# hello',
        }) as FormDataEntryValue,
    };

    const res = await postDocument({ formData: async () => formData } as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.status).toBe('failed');
    expect(String(body.document.errorMessage)).toContain('ingest crash');
    expect(getConversationDocumentByIdMock).toHaveBeenCalledWith('c1', 'd1');
    expect(createConversationDocumentIndexJobMock).toHaveBeenCalledWith('d1');
    expect(markConversationDocumentIndexJobRunningMock).toHaveBeenCalledWith('job-1');
    expect(markConversationDocumentIndexJobSuccessMock).not.toHaveBeenCalled();
    expect(markConversationDocumentIndexJobFailedMock).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('ingest crash'),
    );
  });

  it('lists documents for owned conversation', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    listConversationDocumentsMock.mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }]);

    const res = await getDocuments({} as Request, {
      params: Promise.resolve({ id: 'c1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(listConversationDocumentsMock).toHaveBeenCalledWith('c1');
  });

  it('gets document detail for owner-scoped conversation', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    getConversationDocumentByIdMock.mockResolvedValueOnce({ id: 'd1', conversationId: 'c1' });

    const res = await getDocumentDetail({} as Request, {
      params: Promise.resolve({ id: 'c1', documentId: 'd1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.id).toBe('d1');
    expect(getConversationDocumentByIdMock).toHaveBeenCalledWith('c1', 'd1');
  });

  it('deletes document for owner-scoped conversation', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    deleteConversationDocumentMock.mockResolvedValueOnce(true);

    const res = await deleteDocument({} as Request, {
      params: Promise.resolve({ id: 'c1', documentId: 'd1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(deleteDocumentPointsMock).toHaveBeenCalledWith({
      conversationId: 'c1',
      documentId: 'd1',
    });
    expect(deleteConversationDocumentMock).toHaveBeenCalledWith('c1', 'd1');
    const qdrantCallOrder = deleteDocumentPointsMock.mock.invocationCallOrder[0];
    const dbCallOrder = deleteConversationDocumentMock.mock.invocationCallOrder[0];
    expect(qdrantCallOrder).toBeLessThan(dbCallOrder);
  });

  it('returns signal when vector cleanup fails after delete', async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    conversationFindFirstMock.mockResolvedValueOnce({ id: 'c1' });
    deleteDocumentPointsMock.mockRejectedValueOnce(new Error('qdrant unavailable'));

    const res = await deleteDocument({} as Request, {
      params: Promise.resolve({ id: 'c1', documentId: 'd1' }),
    });
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toContain('vector cleanup failed');
    expect(deleteConversationDocumentMock).not.toHaveBeenCalled();
  });
});
