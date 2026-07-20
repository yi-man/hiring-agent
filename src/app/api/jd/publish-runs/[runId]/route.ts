import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  getPublishRun,
  listPublishRunEvents,
  reconcileTerminalPublishRunWithRetry,
} from '@/lib/jd-publishing/publish-run-repo';
import { recoverStaleJobDescriptionPublishing } from '@/lib/jd/job-description-repo';

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
      return NextResponse.json({ error: 'publish run id is required' }, { status: 400 });
    }

    let run = await getPublishRun({ userId: auth.user.id, runId });
    if (!run) {
      return NextResponse.json({ error: 'publish run not found' }, { status: 404 });
    }

    if (run.status === 'success' || run.status === 'failed') {
      await reconcileTerminalPublishRunWithRetry(run, { maxAttempts: 2 }).catch((error) => {
        console.error('Failed to self-heal JD status from terminal publish run', { runId, error });
      });
    } else {
      await recoverStaleJobDescriptionPublishing({
        userId: auth.user.id,
        id: run.jobDescriptionId,
      });
      run = (await getPublishRun({ userId: auth.user.id, runId })) ?? run;
    }

    const events = await listPublishRunEvents({
      userId: auth.user.id,
      runId,
      limit: 200,
    });

    return NextResponse.json({ run, events });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
