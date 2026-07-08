import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  getCandidateScreeningRun,
  listCandidateScreeningRunEvents,
} from '@/lib/candidate-screening/repo';

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

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const auth = await requireAuth();
    const { runId } = await context.params;
    if (!runId?.trim()) {
      return badRequest('candidate screening run id is required');
    }

    const [run, events] = await Promise.all([
      getCandidateScreeningRun({ userId: auth.user.id, runId }),
      listCandidateScreeningRunEvents({ userId: auth.user.id, runId, limit: 300 }),
    ]);
    if (!run) {
      return NextResponse.json({ error: 'candidate screening run not found' }, { status: 404 });
    }

    return NextResponse.json({ run, events });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
