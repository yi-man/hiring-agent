import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getCandidateCommunicationRun } from '@/lib/candidate-communication/repo';

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
      return badRequest('candidate communication run id is required');
    }

    const run = await getCandidateCommunicationRun({ userId: auth.user.id, runId });
    if (!run) {
      return NextResponse.json({ error: 'candidate communication run not found' }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
