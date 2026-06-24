import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import {
  deleteConversationDocument,
  getConversationDocumentById,
} from '@/lib/chat/repositories/document-repo';
import { prisma } from '@/lib/prisma';
import { deleteDocumentPoints } from '@/lib/rag/qdrant';

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id, documentId } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }
    if (!documentId?.trim()) {
      return NextResponse.json({ error: 'document id is required' }, { status: 400 });
    }

    const conversation = await findOwnedConversationId(id, auth.user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
    }

    const document = await getConversationDocumentById(id, documentId);
    if (!document) {
      return NextResponse.json({ error: 'document not found' }, { status: 404 });
    }

    return NextResponse.json({ document });
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id, documentId } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }
    if (!documentId?.trim()) {
      return NextResponse.json({ error: 'document id is required' }, { status: 400 });
    }

    const conversation = await findOwnedConversationId(id, auth.user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
    }

    try {
      await deleteDocumentPoints({ conversationId: id, documentId });
    } catch (error) {
      // Qdrant 不可用时仍删除数据库记录：列表与 chunk 正文消失，检索无法拼出上下文；
      // 若向量点残留，Qdrant 可能仍命中但 hydrate 阶段找不到 chunk，行为等同不可检索。
      console.warn('conversation document delete: qdrant cleanup failed', error);
    }
    const deleted = await deleteConversationDocument(id, documentId);
    if (!deleted) {
      return NextResponse.json({ error: 'document not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
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
