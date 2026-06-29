import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseUpdateCandidateProgressPayload } from '@/lib/candidate-screening/api';
import {
  getCandidateScreeningDetail,
  updateCandidateInterviewProgress,
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id, candidateId } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }
    if (!candidateId?.trim()) {
      return badRequest('candidate id is required');
    }

    const candidate = await getCandidateScreeningDetail({
      userId: auth.user.id,
      jobDescriptionId: id,
      candidateId,
    });
    if (!candidate) {
      return NextResponse.json({ error: 'candidate screening result not found' }, { status: 404 });
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id, candidateId } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }
    if (!candidateId?.trim()) {
      return badRequest('candidate id is required');
    }

    const parsed = parseUpdateCandidateProgressPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const candidate = await updateCandidateInterviewProgress({
      userId: auth.user.id,
      jobDescriptionId: id,
      candidateId,
      ...parsed.value,
    });
    if (!candidate) {
      return NextResponse.json({ error: 'candidate screening result not found' }, { status: 404 });
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
