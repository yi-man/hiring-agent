import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getJobDescriptionById, updateJobDescription } from '@/lib/jd/job-description-repo';
import { parseUpdateJobDescriptionPayload } from '@/lib/jd/api';

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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const jobDescription = await getJobDescriptionById(auth.user.id, id);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    return NextResponse.json({ jobDescription });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const parsed = parseUpdateJobDescriptionPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }
    const value = parsed.value;

    const jobDescription = await updateJobDescription({
      userId: auth.user.id,
      id,
      ...value,
    });
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    return NextResponse.json({ jobDescription });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
