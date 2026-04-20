import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { touchConversation } from '@/lib/chat/repositories/conversation-repo';
import { createMessage } from '@/lib/chat/repositories/message-repo';
import { runPattern } from '@/lib/chat/patterns/pattern-runner';
import {
  appendRunEvent,
  createRun,
  getRun,
  markRunStatus,
  setRunApprovalToken,
} from '@/lib/chat/patterns/run-store';
import { isChatPatternId, type ChatRunEvent } from '@/lib/chat/patterns/types';
import { prisma } from '@/lib/prisma';

function eventToSse(event: ChatRunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    const body = (await request.json()) as {
      content?: string;
      patternId?: string;
      runId?: string;
      fromSeq?: number;
      approvalToken?: string;
      replayOnly?: boolean;
    };
    const input = body.content?.trim();
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }
    if (!input) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    if (!body.patternId || !isChatPatternId(body.patternId)) {
      return NextResponse.json({ error: 'invalid pattern id' }, { status: 400 });
    }
    const patternId = body.patternId;
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

    const runId = body.runId?.trim() || randomUUID();
    let run = getRun(runId);
    if (!run) {
      run = createRun({ runId, conversationId: id, patternId });
      await createMessage({
        conversationId: id,
        role: 'user',
        content: input,
      });
      await touchConversation(id);
    } else if (run.conversationId !== id) {
      return NextResponse.json(
        { error: 'run does not belong to this conversation' },
        { status: 400 },
      );
    }

    const fromSeq = typeof body.fromSeq === 'number' ? body.fromSeq : 0;
    const encoder = new TextEncoder();
    let seq = run.events.length;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const replay = run?.events.filter((event) => event.seq >= fromSeq) ?? [];
          for (const item of replay) {
            controller.enqueue(encoder.encode(eventToSse(item)));
          }
          if (body.replayOnly) {
            controller.close();
            return;
          }
          if (run && run.status !== 'running' && replay.length > 0) {
            controller.close();
            return;
          }

          let assistantFinal = '';
          for await (const rawEvent of runPattern({
            runId,
            patternId,
            userInput: input,
            approvalToken: body.approvalToken,
          })) {
            const event = { ...rawEvent, seq: seq++ } as ChatRunEvent;
            appendRunEvent(runId, event);
            if (event.type === 'approval_required') {
              setRunApprovalToken(runId, event.approvalToken);
              markRunStatus(runId, 'paused_for_approval');
            }
            if (event.type === 'assistant_final') {
              assistantFinal = event.text;
            }
            if (event.type === 'run_end') {
              markRunStatus(runId, 'completed');
              setRunApprovalToken(runId, undefined);
            }
            controller.enqueue(encoder.encode(eventToSse(event)));
          }

          if (assistantFinal) {
            await createMessage({
              conversationId: id,
              role: 'assistant',
              content: assistantFinal,
            });
            await touchConversation(id);
          }
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'pattern run failed';
          const event = { type: 'error', runId, message, seq: seq++ } as const;
          appendRunEvent(runId, event);
          markRunStatus(runId, 'failed');
          controller.enqueue(encoder.encode(eventToSse(event)));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
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
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
