import {
  DELETE as DELETE_DOCUMENT,
  GET as GET_DOCUMENT,
} from '@/app/api/knowledge/documents/[documentId]/route';
import { GET as LIST_DOCUMENTS, POST as POST_DOCUMENT } from '@/app/api/knowledge/documents/route';
import {
  createKnowledgeDocument,
  createKnowledgeDocumentIndexJob,
  deleteKnowledgeDocument,
  getKnowledgeDocumentById,
  listKnowledgeDocuments,
  markKnowledgeDocumentIndexJobFailed,
  markKnowledgeDocumentIndexJobRunning,
  markKnowledgeDocumentIndexJobSuccess,
} from '@/lib/rag/knowledge-repo';
import { ingestKnowledgeDocument } from '@/lib/rag/knowledge-ingest';

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

jest.mock('@/lib/rag/knowledge-repo', () => ({
  createKnowledgeDocument: jest.fn(),
  createKnowledgeDocumentIndexJob: jest.fn(),
  getKnowledgeDocumentById: jest.fn(),
  listKnowledgeDocuments: jest.fn(),
  deleteKnowledgeDocument: jest.fn(),
  markKnowledgeDocumentIndexJobRunning: jest.fn(),
  markKnowledgeDocumentIndexJobSuccess: jest.fn(),
  markKnowledgeDocumentIndexJobFailed: jest.fn(),
}));

jest.mock('@/lib/rag/knowledge-ingest', () => ({
  ingestKnowledgeDocument: jest.fn(),
}));

const createKnowledgeDocumentMock = createKnowledgeDocument as jest.MockedFunction<
  typeof createKnowledgeDocument
>;
const createKnowledgeDocumentIndexJobMock = createKnowledgeDocumentIndexJob as jest.MockedFunction<
  typeof createKnowledgeDocumentIndexJob
>;
const getKnowledgeDocumentByIdMock = getKnowledgeDocumentById as jest.MockedFunction<
  typeof getKnowledgeDocumentById
>;
const listKnowledgeDocumentsMock = listKnowledgeDocuments as jest.MockedFunction<
  typeof listKnowledgeDocuments
>;
const deleteKnowledgeDocumentMock = deleteKnowledgeDocument as jest.MockedFunction<
  typeof deleteKnowledgeDocument
>;
const markKnowledgeDocumentIndexJobRunningMock =
  markKnowledgeDocumentIndexJobRunning as jest.MockedFunction<
    typeof markKnowledgeDocumentIndexJobRunning
  >;
const markKnowledgeDocumentIndexJobSuccessMock =
  markKnowledgeDocumentIndexJobSuccess as jest.MockedFunction<
    typeof markKnowledgeDocumentIndexJobSuccess
  >;
const markKnowledgeDocumentIndexJobFailedMock =
  markKnowledgeDocumentIndexJobFailed as jest.MockedFunction<
    typeof markKnowledgeDocumentIndexJobFailed
  >;
const ingestKnowledgeDocumentMock = ingestKnowledgeDocument as jest.MockedFunction<
  typeof ingestKnowledgeDocument
>;

type UploadFileLike = {
  name?: string;
  size?: number;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

function formRequest(file: UploadFileLike | string | null) {
  return {
    headers: {
      get: () => null,
    },
    formData: async () => ({
      get: (key: string) => (key === 'file' ? file : null),
    }),
  } as Request;
}

describe('knowledge documents API routes', () => {
  beforeEach(() => {
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns 401 when list request is unauthenticated', async () => {
    const error = new Error('Unauthorized') as Error & { status?: number; name?: string };
    error.name = 'UnauthorizedError';
    error.status = 401;
    requireAuthMock.mockRejectedValueOnce(error);

    const res = await LIST_DOCUMENTS({} as Request);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain('Unauthorized');
    expect(listKnowledgeDocumentsMock).not.toHaveBeenCalled();
  });

  it('lists current user knowledge documents with total', async () => {
    const documents = [{ id: 'doc-1', userId: 'u1', filename: 'handbook.md' }];
    listKnowledgeDocumentsMock.mockResolvedValueOnce(
      documents as Awaited<ReturnType<typeof listKnowledgeDocuments>>,
    );

    const res = await LIST_DOCUMENTS({} as Request);
    const body = await res.json();

    expect(listKnowledgeDocumentsMock).toHaveBeenCalledWith('u1');
    expect(res.status).toBe(200);
    expect(body).toEqual({ documents, total: 1 });
  });

  it('rejects missing upload file', async () => {
    const res = await POST_DOCUMENT(formRequest(null));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('file');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects non-object upload file payload', async () => {
    const res = await POST_DOCUMENT(formRequest('not-a-file'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('invalid file payload');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects non-readable upload file payload', async () => {
    const res = await POST_DOCUMENT(formRequest({ name: 'handbook.md', size: 10 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('invalid file payload');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects non-Markdown upload filenames', async () => {
    const res = await POST_DOCUMENT(
      formRequest({ name: 'handbook.txt', size: 10, text: async () => 'hello' }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('.md');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects zero-size upload files', async () => {
    const res = await POST_DOCUMENT(
      formRequest({ name: 'handbook.md', size: 0, text: async () => '' }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('empty');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects upload files over 5MB', async () => {
    const res = await POST_DOCUMENT(
      formRequest({ name: 'handbook.md', size: 5 * 1024 * 1024 + 1, text: async () => 'hello' }),
    );
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.error).toContain('5MB');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects oversized Content-Length before parsing formData', async () => {
    const formDataMock = jest.fn(async () => ({
      get: () => ({ name: 'handbook.md', size: 12, text: async () => '# Handbook' }),
    }));
    const req = {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-length' ? String(5 * 1024 * 1024 + 512 * 1024 + 1) : null,
      },
      formData: formDataMock,
    } as unknown as Request;

    const res = await POST_DOCUMENT(req);
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.error).toContain('5MB');
    expect(formDataMock).not.toHaveBeenCalled();
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only markdown content before creating a document', async () => {
    const res = await POST_DOCUMENT(
      formRequest({ name: 'handbook.md', size: 4, text: async () => ' \n\t ' }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('empty');
    expect(createKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('creates a processing document, ingests synchronously, and returns latest ready document', async () => {
    const createdDocument = { id: 'doc-1', status: 'processing' };
    const indexJob = { id: 'job-1' };
    const latestDocument = { id: 'doc-1', userId: 'u1', filename: 'handbook.md', status: 'ready' };
    createKnowledgeDocumentMock.mockResolvedValueOnce(
      createdDocument as Awaited<ReturnType<typeof createKnowledgeDocument>>,
    );
    createKnowledgeDocumentIndexJobMock.mockResolvedValueOnce(
      indexJob as Awaited<ReturnType<typeof createKnowledgeDocumentIndexJob>>,
    );
    ingestKnowledgeDocumentMock.mockResolvedValueOnce();
    getKnowledgeDocumentByIdMock.mockResolvedValueOnce(
      latestDocument as Awaited<ReturnType<typeof getKnowledgeDocumentById>>,
    );

    const res = await POST_DOCUMENT(
      formRequest({ name: 'Handbook.md', size: 12, text: async () => '# Handbook' }),
    );
    const body = await res.json();

    expect(createKnowledgeDocumentMock).toHaveBeenCalledWith({
      userId: 'u1',
      filename: 'Handbook.md',
      title: 'Handbook',
      sourceLabel: null,
      contentMarkdown: '# Handbook',
      status: 'processing',
    });
    expect(createKnowledgeDocumentIndexJobMock).toHaveBeenCalledWith('doc-1');
    expect(markKnowledgeDocumentIndexJobRunningMock).toHaveBeenCalledWith('job-1');
    expect(ingestKnowledgeDocumentMock).toHaveBeenCalledWith({ userId: 'u1', documentId: 'doc-1' });
    expect(markKnowledgeDocumentIndexJobSuccessMock).toHaveBeenCalledWith('job-1');
    expect(markKnowledgeDocumentIndexJobFailedMock).not.toHaveBeenCalled();
    expect(getKnowledgeDocumentByIdMock).toHaveBeenCalledWith('u1', 'doc-1');
    expect(res.status).toBe(201);
    expect(body).toEqual({ document: latestDocument });
  });

  it('reads upload content from arrayBuffer when text is unavailable', async () => {
    const createdDocument = { id: 'doc-1', status: 'processing' };
    createKnowledgeDocumentMock.mockResolvedValueOnce(
      createdDocument as Awaited<ReturnType<typeof createKnowledgeDocument>>,
    );
    createKnowledgeDocumentIndexJobMock.mockResolvedValueOnce({ id: 'job-1' } as Awaited<
      ReturnType<typeof createKnowledgeDocumentIndexJob>
    >);
    getKnowledgeDocumentByIdMock.mockResolvedValueOnce({ id: 'doc-1', status: 'ready' } as Awaited<
      ReturnType<typeof getKnowledgeDocumentById>
    >);

    await POST_DOCUMENT(
      formRequest({
        name: 'handbook.md',
        size: 10,
        arrayBuffer: async () => new TextEncoder().encode('buffer markdown').buffer,
      }),
    );

    expect(createKnowledgeDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentMarkdown: 'buffer markdown' }),
    );
  });

  it('marks ingest failure and returns latest failed document with 201', async () => {
    const createdDocument = { id: 'doc-1', status: 'processing' };
    const failedDocument = {
      id: 'doc-1',
      userId: 'u1',
      filename: 'handbook.md',
      status: 'failed',
      errorMessage: 'embedding service unavailable',
    };
    createKnowledgeDocumentMock.mockResolvedValueOnce(
      createdDocument as Awaited<ReturnType<typeof createKnowledgeDocument>>,
    );
    createKnowledgeDocumentIndexJobMock.mockResolvedValueOnce({ id: 'job-1' } as Awaited<
      ReturnType<typeof createKnowledgeDocumentIndexJob>
    >);
    ingestKnowledgeDocumentMock.mockRejectedValueOnce(new Error('embedding service unavailable'));
    getKnowledgeDocumentByIdMock.mockResolvedValueOnce(
      failedDocument as Awaited<ReturnType<typeof getKnowledgeDocumentById>>,
    );

    const res = await POST_DOCUMENT(
      formRequest({ name: 'handbook.md', size: 12, text: async () => '# Handbook' }),
    );
    const body = await res.json();

    expect(markKnowledgeDocumentIndexJobFailedMock).toHaveBeenCalledWith(
      'job-1',
      'embedding service unavailable',
    );
    expect(markKnowledgeDocumentIndexJobSuccessMock).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
    expect(body).toEqual({ document: failedDocument });
  });

  it('returns 409 when latest document remains processing', async () => {
    const processingDocument = { id: 'doc-1', userId: 'u1', status: 'processing' };
    createKnowledgeDocumentMock.mockResolvedValueOnce({ id: 'doc-1' } as Awaited<
      ReturnType<typeof createKnowledgeDocument>
    >);
    createKnowledgeDocumentIndexJobMock.mockResolvedValueOnce({ id: 'job-1' } as Awaited<
      ReturnType<typeof createKnowledgeDocumentIndexJob>
    >);
    getKnowledgeDocumentByIdMock.mockResolvedValueOnce(
      processingDocument as Awaited<ReturnType<typeof getKnowledgeDocumentById>>,
    );

    const res = await POST_DOCUMENT(
      formRequest({ name: 'handbook.md', size: 12, text: async () => '# Handbook' }),
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.document).toBe(processingDocument);
  });

  it('returns current user document details', async () => {
    const document = { id: 'doc-1', userId: 'u1', filename: 'handbook.md' };
    getKnowledgeDocumentByIdMock.mockResolvedValueOnce(
      document as Awaited<ReturnType<typeof getKnowledgeDocumentById>>,
    );

    const res = await GET_DOCUMENT({} as Request, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const body = await res.json();

    expect(getKnowledgeDocumentByIdMock).toHaveBeenCalledWith('u1', 'doc-1');
    expect(res.status).toBe(200);
    expect(body).toEqual({ document });
  });

  it('returns 404 when current user document is missing', async () => {
    getKnowledgeDocumentByIdMock.mockResolvedValueOnce(null);

    const res = await GET_DOCUMENT({} as Request, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });

  it('deletes only the current user document', async () => {
    deleteKnowledgeDocumentMock.mockResolvedValueOnce(true);

    const res = await DELETE_DOCUMENT({} as Request, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const body = await res.json();

    expect(deleteKnowledgeDocumentMock).toHaveBeenCalledWith('u1', 'doc-1');
    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: true });
  });

  it('returns 404 when delete does not find a current user document', async () => {
    deleteKnowledgeDocumentMock.mockResolvedValueOnce(false);

    const res = await DELETE_DOCUMENT({} as Request, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });
});
