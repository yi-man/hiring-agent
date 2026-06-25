import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { ingestKnowledgeDocument } from '@/lib/rag/knowledge-ingest';
import {
  createKnowledgeDocument,
  createKnowledgeDocumentIndexJob,
  getKnowledgeDocumentById,
  listKnowledgeDocuments,
  markKnowledgeDocumentIndexJobFailed,
  markKnowledgeDocumentIndexJobRunning,
  markKnowledgeDocumentIndexJobSuccess,
} from '@/lib/rag/knowledge-repo';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 512 * 1024;
const MAX_MULTIPART_CONTENT_LENGTH_BYTES = MAX_FILE_SIZE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

type UploadFileLike = {
  name?: string;
  size?: number;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

function asUploadFile(value: FormDataEntryValue): UploadFileLike | null {
  if (typeof value !== 'object') {
    return null;
  }
  return value as UploadFileLike;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '').trim();
}

function validateUploadFile(file: UploadFileLike | null): { error: string; status: number } | null {
  if (!file) {
    return { error: 'file is required', status: 400 };
  }

  const filename = file.name?.trim();
  if (!filename || !filename.toLowerCase().endsWith('.md')) {
    return { error: 'only .md files are supported', status: 400 };
  }

  if (typeof file.size !== 'number' || Number.isNaN(file.size)) {
    return { error: 'invalid file payload', status: 400 };
  }

  if (file.size === 0) {
    return { error: 'file must not be empty', status: 400 };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: 'file exceeds 5MB limit', status: 413 };
  }

  if (typeof file.text !== 'function' && typeof file.arrayBuffer !== 'function') {
    return { error: 'invalid file payload', status: 400 };
  }

  return null;
}

function contentLengthExceedsLimit(contentLength: string | null): boolean {
  if (!contentLength) {
    return false;
  }

  const parsedContentLength = Number(contentLength);
  return (
    Number.isFinite(parsedContentLength) && parsedContentLength > MAX_MULTIPART_CONTENT_LENGTH_BYTES
  );
}

async function readFileContentMarkdown(file: UploadFileLike): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  if (typeof file.arrayBuffer === 'function') {
    const bytes = await file.arrayBuffer();
    return Buffer.from(bytes).toString('utf8');
  }
  throw new Error('invalid file payload');
}

function authErrorResponse(error: unknown) {
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError')
  ) {
    const status = error instanceof UnauthorizedError ? error.status : 401;
    return NextResponse.json({ error: error.message }, { status });
  }
  return null;
}

function serverErrorResponse(error: unknown) {
  const authResponse = authErrorResponse(error);
  if (authResponse) {
    return authResponse;
  }
  if (isDependencyOutageError(error)) {
    return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
  }
  const message = error instanceof Error ? error.message : 'Unknown server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const auth = await requireAuth();
    const documents = await listKnowledgeDocuments(auth.user.id);
    return NextResponse.json({ documents, total: documents.length });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (contentLengthExceedsLimit(request.headers.get('content-length'))) {
      return NextResponse.json({ error: 'file exceeds 5MB limit' }, { status: 413 });
    }

    const formData = await request.formData();
    const fileValue = formData.get('file');
    if (fileValue === null) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const file = asUploadFile(fileValue);
    if (!file) {
      return NextResponse.json({ error: 'invalid file payload' }, { status: 400 });
    }

    const validationError = validateUploadFile(file);
    if (validationError) {
      return NextResponse.json(
        { error: validationError.error },
        { status: validationError.status },
      );
    }

    const filename = file.name?.trim() ?? '';
    const contentMarkdown = await readFileContentMarkdown(file);
    if (!contentMarkdown.trim()) {
      return NextResponse.json({ error: 'markdown content must not be empty' }, { status: 400 });
    }

    const document = await createKnowledgeDocument({
      userId: auth.user.id,
      filename,
      title: titleFromFilename(filename),
      sourceLabel: null,
      contentMarkdown,
      status: 'processing',
    });
    const indexJob = await createKnowledgeDocumentIndexJob(document.id);

    await markKnowledgeDocumentIndexJobRunning(indexJob.id);
    try {
      await ingestKnowledgeDocument({ userId: auth.user.id, documentId: document.id });
      await markKnowledgeDocumentIndexJobSuccess(indexJob.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'knowledge document ingest failed';
      await markKnowledgeDocumentIndexJobFailed(indexJob.id, message);
    }

    const latestDocument = await getKnowledgeDocumentById(auth.user.id, document.id);
    if (!latestDocument) {
      return NextResponse.json({ error: 'document record missing after upload' }, { status: 500 });
    }
    if (latestDocument.status === 'processing') {
      return NextResponse.json(
        { error: 'document is still processing', document: latestDocument },
        { status: 409 },
      );
    }

    return NextResponse.json({ document: latestDocument }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
