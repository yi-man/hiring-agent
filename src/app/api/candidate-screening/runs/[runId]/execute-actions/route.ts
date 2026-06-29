import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseExecuteActionsPayload } from '@/lib/candidate-screening/api';
import { getCandidateScreeningRun } from '@/lib/candidate-screening/repo';
import { executeScreeningRunActions } from '@/lib/candidate-screening/runner';

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

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const auth = await requireAuth();
    const { runId } = await context.params;
    if (!runId?.trim()) {
      return badRequest('candidate screening run id is required');
    }

    const parsed = parseExecuteActionsPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const run = await getCandidateScreeningRun({ userId: auth.user.id, runId });
    if (!run) {
      return NextResponse.json({ error: 'candidate screening run not found' }, { status: 404 });
    }

    await executeScreeningRunActions({
      userId: auth.user.id,
      runId,
      request: parsed.value,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
