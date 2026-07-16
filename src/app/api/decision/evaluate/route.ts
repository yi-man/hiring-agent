import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseEvaluateCandidateDecisionPayload } from '@/lib/candidate-screening/api';
import { evaluateCandidateHiringDecision } from '@/lib/candidate-screening/hiring-decision';
import {
  getCandidateScreeningDetail,
  listCandidateInterviewFeedbacks,
} from '@/lib/candidate-screening/repo';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';

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

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: 'invalid JSON body' };
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const parsed = parseEvaluateCandidateDecisionPayload(body.value);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const jobDescription = await getJobDescriptionById(auth.user.id, parsed.value.jobDescriptionId);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    const candidate = await getCandidateScreeningDetail({
      userId: auth.user.id,
      jobDescriptionId: parsed.value.jobDescriptionId,
      candidateId: parsed.value.candidateId,
    });
    if (!candidate) {
      return NextResponse.json({ error: 'candidate screening result not found' }, { status: 404 });
    }

    const interviewFeedbacks = await listCandidateInterviewFeedbacks({
      userId: auth.user.id,
      jobDescriptionId: parsed.value.jobDescriptionId,
      candidateId: parsed.value.candidateId,
    });
    if (interviewFeedbacks.length === 0) {
      return NextResponse.json({ error: '至少完成一轮结构化评价后才能生成建议' }, { status: 409 });
    }
    const decision = evaluateCandidateHiringDecision({
      jobDescription,
      candidate,
      interviewFeedbacks,
    });

    return NextResponse.json({ decision });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
