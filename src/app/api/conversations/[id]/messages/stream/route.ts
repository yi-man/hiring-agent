import { NextResponse } from 'next/server';
import { streamChatReply } from '@/lib/chat/chain';
import { touchConversation } from '@/lib/chat/repositories/conversation-repo';
import { createMessage } from '@/lib/chat/repositories/message-repo';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
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
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
