import { NextResponse } from 'next/server';
import { streamChatReply } from '@/lib/chat/chain';
import { touchConversation } from '@/lib/chat/repositories/conversation-repo';
import { createMessage } from '@/lib/chat/repositories/message-repo';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { prisma } from '@/lib/prisma';

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
    const { content } = (await request.json()) as { content?: string };
    const input = content?.trim();
    if (!input) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    await createMessage({
      conversationId: id,
      role: 'user',
      content: input,
    });
    await touchConversation(id);

    const { chunks, collect } = await streamChatReply(id, input);

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
