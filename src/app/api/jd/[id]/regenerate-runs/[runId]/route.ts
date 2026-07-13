import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  failStaleJobDescriptionRegenerateRuns,
  getJobDescriptionRegenerateRun,
  listJobDescriptionRegenerateRunEvents,
} from '@/lib/jd/regenerate-run-repo';

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id, runId } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }
    if (!runId?.trim()) {
      return badRequest('JD regenerate run id is required');
    }

    await failStaleJobDescriptionRegenerateRuns({ userId: auth.user.id });
    const run = await getJobDescriptionRegenerateRun({
      userId: auth.user.id,
      runId,
      jobDescriptionId: id,
    });
    if (!run) {
      return NextResponse.json({ error: 'JD regenerate run not found' }, { status: 404 });
    }
    const events = await listJobDescriptionRegenerateRunEvents({
      userId: auth.user.id,
      runId,
      limit: 200,
    });

    return NextResponse.json({ run, events });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
