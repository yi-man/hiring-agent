import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { CANDIDATE_SCREENING_INTERVIEW_STAGES } from '@/lib/candidate-screening/constants';
import { listCandidateScreeningResults } from '@/lib/candidate-screening/repo';
import type { CandidateInterviewStage } from '@/lib/candidate-screening/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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

function isCandidateInterviewStage(value: string): value is CandidateInterviewStage {
  return CANDIDATE_SCREENING_INTERVIEW_STAGES.includes(value as CandidateInterviewStage);
}

function parseLimit(value: string | null): number {
  if (value === null) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

function parseOffset(value: string | null): number {
  if (value === null) {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const { searchParams } = new URL(request.url);
    const interviewStageParam = searchParams.get('interviewStage');
    let interviewStage: CandidateInterviewStage | undefined;
    if (interviewStageParam) {
      if (!isCandidateInterviewStage(interviewStageParam)) {
        return badRequest('interviewStage is invalid');
      }
      interviewStage = interviewStageParam;
    }

    const candidates = await listCandidateScreeningResults({
      userId: auth.user.id,
      jobDescriptionId: id,
      limit: parseLimit(searchParams.get('limit')),
      offset: parseOffset(searchParams.get('offset')),
      interviewStage,
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
