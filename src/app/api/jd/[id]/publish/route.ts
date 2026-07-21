import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  claimJobDescriptionForPublishing,
  recoverStaleJobDescriptionPublishing,
  runWithJobDescriptionPublishLease,
} from '@/lib/jd/job-description-repo';
import { parsePublishJobDescriptionPayload } from '@/lib/jd-publishing/publish-payload';
import { listPublishTasksForJobDescription } from '@/lib/jd-publishing/publish-repo';
import { reconcilePublishBatchWithRetry } from '@/lib/jd-publishing/publish-run-repo';
import { publishJobDescriptionToBossLike } from '@/lib/jd-publishing/service';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const parsed = parsePublishJobDescriptionPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const batchId = randomUUID();
    const claim = await claimJobDescriptionForPublishing({
      userId: auth.user.id,
      id,
      batchId,
    });
    if (!claim.ok && claim.reason === 'not_found') {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }
    if (!claim.ok && claim.reason === 'conflict') {
      return conflict(claim.conflict ?? 'job description cannot be published');
    }
    if (!claim.ok) return conflict('job description status changed, please retry');
    const claimed = claim.jobDescription;

    let task;
    try {
      task = await runWithJobDescriptionPublishLease({
        userId: auth.user.id,
        id,
        batchId,
        operation: () =>
          publishJobDescriptionToBossLike({
            jobDescription: claimed,
            settings: parsed.value,
            batchId,
          }),
      });
    } catch (error) {
      const updated = await reconcilePublishBatchWithRetry({
        userId: auth.user.id,
        id,
        batchId,
        mode: 'direct',
        result: 'failed',
      });
      const message = error instanceof Error ? error.message : 'Unknown server error';
      return NextResponse.json({ error: message, jobDescription: updated }, { status: 500 });
    }

    const updated = await reconcilePublishBatchWithRetry({
      userId: auth.user.id,
      id,
      batchId,
      mode: 'direct',
      result: task.status === 'success' ? 'success' : 'failed',
    });

    const body = {
      jobDescription: updated,
      task,
      ...(task.status === 'failed' ? { error: 'JD publish execution failed' } : {}),
    };

    return NextResponse.json(body, { status: task.status === 'success' ? 200 : 502 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    await recoverStaleJobDescriptionPublishing({ userId: auth.user.id, id });

    const tasks = await listPublishTasksForJobDescription({
      userId: auth.user.id,
      jobDescriptionId: id,
      limit: 5,
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
