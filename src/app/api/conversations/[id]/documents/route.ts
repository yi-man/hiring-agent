import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import {
  createConversationDocument,
  listConversationDocuments,
} from '@/lib/chat/repositories/document-repo';
import { prisma } from '@/lib/prisma';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
type UploadFileLike = {
  name?: string;
  size?: number;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

async function findOwnedConversationId(conversationId: string, userId: string) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: {
      id: true,
    },
  });
}

async function enqueueDocumentIngest(params: { conversationId: string; documentId: string }) {
  void params;
  // TODO: wire this to the async ingest/indexing pipeline.
}

function triggerDocumentIngest(params: { conversationId: string; documentId: string }) {
  void Promise.resolve()
    .then(() => enqueueDocumentIngest(params))
    .catch(() => {
      // Swallow errors because ingestion is best-effort and async.
    });
}

function asUploadFile(value: FormDataEntryValue | null): UploadFileLike | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as UploadFileLike;
}

async function readFileContentMarkdown(file: UploadFileLike): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  if (typeof file.arrayBuffer === 'function') {
    const bytes = await file.arrayBuffer();
    return Buffer.from(bytes).toString('utf8');
  }
  throw new Error('unable to read uploaded file');
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }

    const conversation = await findOwnedConversationId(id, auth.user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const fileValue = asUploadFile(formData.get('file'));
    if (!fileValue) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const filename = fileValue.name?.trim();
    if (!filename || !filename.toLowerCase().endsWith('.md')) {
      return NextResponse.json({ error: 'only .md files are supported' }, { status: 400 });
    }
    if (typeof fileValue.size !== 'number' || Number.isNaN(fileValue.size)) {
      return NextResponse.json({ error: 'invalid file payload' }, { status: 400 });
    }

    if (fileValue.size === 0) {
      return NextResponse.json({ error: 'file must not be empty' }, { status: 400 });
    }

    if ((fileValue.size ?? 0) > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'file exceeds 5MB limit' }, { status: 413 });
    }

    const contentMarkdown = await readFileContentMarkdown(fileValue);
    const document = await createConversationDocument({
      conversationId: id,
      filename,
      contentMarkdown,
      status: 'processing',
    });

    triggerDocumentIngest({ conversationId: id, documentId: document.id });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }

    const conversation = await findOwnedConversationId(id, auth.user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
    }

    const documents = await listConversationDocuments(id);
    return NextResponse.json({ documents, total: documents.length });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
