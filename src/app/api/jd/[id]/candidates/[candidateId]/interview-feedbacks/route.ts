import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseUpsertCandidateInterviewFeedbackPayload } from '@/lib/candidate-screening/api';
import { validateCandidateInterviewFeedbackStage } from '@/lib/candidate-screening/interview-stage';
import {
  getCandidateScreeningDetail,
  listCandidateInterviewFeedbacks,
  upsertCandidateInterviewFeedback,
} from '@/lib/candidate-screening/repo';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import { getFormalInterviewStages } from '@/lib/interviews/process';

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

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: 'invalid JSON body' };
  }
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

    const feedbacks = await listCandidateInterviewFeedbacks({
      userId: auth.user.id,
      jobDescriptionId: id,
      candidateId,
    });
    return NextResponse.json({ feedbacks });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(
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

    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const parsed = parseUpsertCandidateInterviewFeedbackPayload(body.value);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const candidate = await getCandidateScreeningDetail({
      userId: auth.user.id,
      jobDescriptionId: id,
      candidateId,
    });
    if (!candidate) {
      return NextResponse.json({ error: 'candidate screening result not found' }, { status: 404 });
    }

    const [feedbacks, jobDescription] = await Promise.all([
      listCandidateInterviewFeedbacks({
        userId: auth.user.id,
        jobDescriptionId: id,
        candidateId,
      }),
      getJobDescriptionById(auth.user.id, id),
    ]);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }
    const feedbackStageValidation = validateCandidateInterviewFeedbackStage(
      candidate.interviewStage,
      parsed.value.stage,
      feedbacks,
      getFormalInterviewStages(jobDescription.interviewProcess),
    );
    if (!feedbackStageValidation.ok) return conflict(feedbackStageValidation.error);

    const feedback = await upsertCandidateInterviewFeedback({
      userId: auth.user.id,
      jobDescriptionId: id,
      candidateId,
      ...parsed.value,
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
