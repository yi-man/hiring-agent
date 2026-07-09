import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  getCandidateScreeningRun,
  listCandidateScreeningRunEvents,
  type CandidateScreeningRunDto,
} from '@/lib/candidate-screening/repo';

const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
const POLL_INTERVAL_MS = 1000;
const MAX_STREAM_SECONDS = 30;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverErrorResponse(error: unknown) {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalRun(run: CandidateScreeningRunDto): boolean {
  return TERMINAL_STATUSES.has(run.status);
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const auth = await requireAuth();
    const { runId } = await context.params;
    if (!runId?.trim()) {
      return badRequest('candidate screening run id is required');
    }

    const initialRun = await getCandidateScreeningRun({ userId: auth.user.id, runId });
    if (!initialRun) {
      return NextResponse.json({ error: 'candidate screening run not found' }, { status: 404 });
    }

    const userId = auth.user.id;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let run: CandidateScreeningRunDto | null = initialRun;

        for (let elapsedSeconds = 0; elapsedSeconds <= MAX_STREAM_SECONDS; elapsedSeconds += 1) {
          if (!run) {
            break;
          }

          const events = await listCandidateScreeningRunEvents({ userId, runId, limit: 300 });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ run, events })}\n\n`));
          if (isTerminalRun(run) || elapsedSeconds === MAX_STREAM_SECONDS) {
            break;
          }

          await sleep(POLL_INTERVAL_MS);
          run = await getCandidateScreeningRun({ userId, runId });
        }

        controller.close();
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
    return serverErrorResponse(error);
  }
}
