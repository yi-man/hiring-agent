import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { runWorkflowAgentWithEvents } from '@/lib/workflow-learning/agent-runner';
import { formatSseData } from '@/lib/workflow-learning/sse';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth();
    const body = (await request.json()) as { message?: string };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const runId = randomUUID();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of runWorkflowAgentWithEvents({
            runId,
            userText: message,
            userId: user.id,
          })) {
            controller.enqueue(encoder.encode(formatSseData(event)));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
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
    const messageText = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
