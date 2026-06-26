import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getJobDescriptionById, updateJobDescription } from '@/lib/jd/job-description-repo';
import { parsePublishJobDescriptionPayload } from '@/lib/jd-publishing/publish-payload';
import { listPublishTasksForJobDescription } from '@/lib/jd-publishing/publish-repo';
import { publishJobDescriptionToBossLike } from '@/lib/jd-publishing/service';

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

    const jobDescription = await getJobDescriptionById(auth.user.id, id);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    await updateJobDescription({
      userId: auth.user.id,
      id,
      status: 'publishing',
    });

    let task;
    try {
      task = await publishJobDescriptionToBossLike({
        jobDescription,
        settings: parsed.value,
      });
    } catch (error) {
      const updated = await updateJobDescription({
        userId: auth.user.id,
        id,
        status: 'publish_failed',
      });
      const message = error instanceof Error ? error.message : 'Unknown server error';
      return NextResponse.json({ error: message, jobDescription: updated }, { status: 500 });
    }

    const nextStatus = task.status === 'success' ? 'published' : 'publish_failed';
    const updated = await updateJobDescription({
      userId: auth.user.id,
      id,
      status: nextStatus,
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
