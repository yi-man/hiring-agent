import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { deleteKnowledgeDocument, getKnowledgeDocumentById } from '@/lib/rag/knowledge-repo';

function serverErrorResponse(error: unknown) {
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

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const auth = await requireAuth();
    const { documentId } = await context.params;
    if (!documentId?.trim()) {
      return NextResponse.json({ error: 'document id is required' }, { status: 400 });
    }

    const document = await getKnowledgeDocumentById(auth.user.id, documentId);
    if (!document) {
      return NextResponse.json({ error: 'document not found' }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { documentId } = await context.params;
    if (!documentId?.trim()) {
      return NextResponse.json({ error: 'document id is required' }, { status: 400 });
    }

    const deleted = await deleteKnowledgeDocument(auth.user.id, documentId);
    if (!deleted) {
      return NextResponse.json({ error: 'document not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
