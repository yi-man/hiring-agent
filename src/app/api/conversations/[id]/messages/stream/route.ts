import { NextResponse } from 'next/server';
import { streamChatReply } from '@/lib/chat/chain';
import { touchConversation } from '@/lib/chat/repositories/conversation-repo';
import { createMessage } from '@/lib/chat/repositories/message-repo';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { retrieveConversationContext } from '@/lib/rag/retrieval';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: auth.user.id,
      },
      select: {
        id: true,
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
    }
    const body = (await request.json()) as { content?: string; documentId?: string | null };
    const input = body.content?.trim();
    if (!input) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    let ragDocumentId: string | null = null;
    const rawDocId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
    if (rawDocId) {
      const doc = await prisma.conversationDocument.findFirst({
        where: { id: rawDocId, conversationId: id },
        select: { id: true, status: true },
      });
      if (!doc) {
        return NextResponse.json({ error: 'document not found' }, { status: 400 });
      }
      if (doc.status !== 'ready') {
        return NextResponse.json({ error: 'document is not ready for retrieval' }, { status: 409 });
      }
      ragDocumentId = doc.id;
    }

    await createMessage({
      conversationId: id,
      role: 'user',
      content: input,
      documentId: ragDocumentId,
    });
    await touchConversation(id);

    let retrievedContext = '';
    try {
      const retrieval = await retrieveConversationContext({
        conversationId: id,
        query: input,
        topK: env.RAG_TOP_K,
        documentId: ragDocumentId,
      });
      retrievedContext = retrieval.contextText;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RAG retrieval failed';
      return NextResponse.json({ error: message, code: 'RAG_RETRIEVAL_FAILED' }, { status: 502 });
    }

    const { chunks, collect } = await streamChatReply(id, input, { retrievedContext });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          const fullReply = await collect();
          await createMessage({
            conversationId: id,
            role: 'assistant',
            content: fullReply,
          });
          await touchConversation(id);
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
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
