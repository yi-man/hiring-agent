import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseUpdateCandidateProgressPayload } from '@/lib/candidate-screening/api';
import { validateCandidateInterviewStageTransition } from '@/lib/candidate-screening/interview-stage';
import {
  CandidateActionInProgressError,
  getCandidateScreeningDetail,
  listCandidateInterviewFeedbacks,
  updateCandidateInterviewProgress,
} from '@/lib/candidate-screening/repo';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import { getFormalInterviewStages, getRequiredInterviewStages } from '@/lib/interviews/process';
import type { InterviewProcessStage } from '@/lib/interviews/types';

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

    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const parsed = parseUpdateCandidateProgressPayload(body.value);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    let expectedInterviewStage: NonNullable<typeof parsed.value.interviewStage> | undefined;
    let requiredInterviewStages: InterviewProcessStage[] | null = null;
    if (parsed.value.interviewStage !== undefined) {
      const current = await getCandidateScreeningDetail({
        userId: auth.user.id,
        jobDescriptionId: id,
        candidateId,
      });
      if (!current) {
        return NextResponse.json(
          { error: 'candidate screening result not found' },
          { status: 404 },
        );
      }
      expectedInterviewStage = current.interviewStage;
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
      requiredInterviewStages = getRequiredInterviewStages(jobDescription.interviewProcess);
      const transition = validateCandidateInterviewStageTransition(
        current.interviewStage,
        parsed.value.interviewStage,
        feedbacks,
        getFormalInterviewStages(jobDescription.interviewProcess),
      );
      if (!transition.ok) return conflict(transition.error);
    }

    if (parsed.value.interviewAssignments !== undefined) {
      if (!requiredInterviewStages) {
        const jobDescription = await getJobDescriptionById(auth.user.id, id);
        if (!jobDescription) {
          return NextResponse.json({ error: 'job description not found' }, { status: 404 });
        }
        requiredInterviewStages = getRequiredInterviewStages(jobDescription.interviewProcess);
      }
      const allowedStages = new Set(requiredInterviewStages.map((stage) => stage.id));
      if (
        parsed.value.interviewAssignments.some((assignment) => !allowedStages.has(assignment.stage))
      ) {
        return badRequest('interview assignment stage is invalid');
      }
    }

    let candidate;
    try {
      candidate = await updateCandidateInterviewProgress({
        userId: auth.user.id,
        jobDescriptionId: id,
        candidateId,
        ...parsed.value,
        ...(expectedInterviewStage === undefined ? {} : { expectedInterviewStage }),
      });
    } catch (error) {
      if (error instanceof CandidateActionInProgressError) {
        return conflict('候选人外发动作正在执行，请等待完成后重试');
      }
      throw error;
    }
    if (!candidate) {
      if (expectedInterviewStage !== undefined) {
        const latest = await getCandidateScreeningDetail({
          userId: auth.user.id,
          jobDescriptionId: id,
          candidateId,
        });
        if (latest) {
          return conflict('候选人进度已变化，请刷新后重试');
        }
      }
      return NextResponse.json({ error: 'candidate screening result not found' }, { status: 404 });
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
