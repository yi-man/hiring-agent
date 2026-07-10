import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  getJobDescriptionCreateRun,
  listJobDescriptionCreateRunEvents,
} from '@/lib/jd/create-run-repo';

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
      return badRequest('JD create run id is required');
    }

    const run = await getJobDescriptionCreateRun({ userId: auth.user.id, runId });
    if (!run) {
      return NextResponse.json({ error: 'JD create run not found' }, { status: 404 });
    }
    const events = await listJobDescriptionCreateRunEvents({
      userId: auth.user.id,
      runId,
      limit: 200,
    });

    return NextResponse.json({ run, events });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
