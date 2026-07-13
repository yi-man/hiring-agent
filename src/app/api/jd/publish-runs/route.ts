import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parsePublishJobDescriptionPayload } from '@/lib/jd-publishing/publish-payload';
import { createAndStartPublishRun } from '@/lib/jd-publishing/publish-run-service';
import { updateJobDescription } from '@/lib/jd/job-description-repo';

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

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const { id } = body;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const parsed = parsePublishJobDescriptionPayload(body);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    await updateJobDescription({
      userId: auth.user.id,
      id,
      status: 'ready_to_publish',
    });

    const run = await createAndStartPublishRun({
      userId: auth.user.id,
      jobDescriptionId: id,
      settings: { ...parsed.value, platform: 'boss-like' },
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
