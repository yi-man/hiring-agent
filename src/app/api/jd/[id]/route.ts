import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  getJobDescriptionById,
  recoverStaleJobDescriptionPublishing,
  updateMutableJobDescription,
} from '@/lib/jd/job-description-repo';
import { getDefaultJdScreeningSummary, listJdScreeningSummaries } from '@/lib/jd/screening-summary';
import { isEditableJobDescriptionStatus, parseUpdateJobDescriptionPayload } from '@/lib/jd/api';
import {
  getAutoMatchedCompanyInterviewProcessForUser,
  getCompanyInterviewProcessForUser,
} from '@/lib/company-profile/repo';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function isImmutable(status: string): boolean {
  return !isEditableJobDescriptionStatus(status);
}

function immutableConflict(status: string) {
  return conflict(`${status} job descriptions cannot be modified`);
}

async function mutableUpdateMissResponse(userId: string, id: string) {
  const latest = await getJobDescriptionById(userId, id);
  if (latest && isImmutable(latest.status)) {
    return immutableConflict(latest.status);
  }
  return NextResponse.json({ error: 'job description not found' }, { status: 404 });
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

    let jobDescription = await getJobDescriptionById(auth.user.id, id);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }
    if (jobDescription.status === 'publishing') {
      jobDescription =
        (await recoverStaleJobDescriptionPublishing({ userId: auth.user.id, id })) ??
        jobDescription;
    }
    const summaries = await listJdScreeningSummaries({
      userId: auth.user.id,
      jobDescriptionIds: [jobDescription.id],
    });

    return NextResponse.json({
      jobDescription: {
        ...jobDescription,
        screeningSummary: summaries[jobDescription.id] ?? getDefaultJdScreeningSummary(),
      },
    });
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

    const current = await getJobDescriptionById(auth.user.id, id);
    if (!current) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }
    if (isImmutable(current.status)) {
      return immutableConflict(current.status);
    }

    const parsed = parseUpdateJobDescriptionPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }
    const value = parsed.value;
    if (
      value.status === 'ready_to_publish' &&
      (value.hiringTarget ?? current.hiringTarget) == null
    ) {
      return badRequest('hiringTarget is required before ready_to_publish');
    }

    const { interviewProcessId, ...update } = value;
    const interviewProcess =
      interviewProcessId === undefined
        ? undefined
        : interviewProcessId === null
          ? await getAutoMatchedCompanyInterviewProcessForUser({
              userId: auth.user.id,
              department: update.department ?? current.department,
              position: update.position ?? current.position,
              positionDescription: update.positionDescription ?? current.positionDescription,
            })
          : await getCompanyInterviewProcessForUser(auth.user.id, interviewProcessId);
    if (interviewProcessId !== undefined && !interviewProcess) {
      return badRequest(
        interviewProcessId
          ? 'interview process is invalid'
          : 'no interview process matched this job',
      );
    }

    const jobDescription = await updateMutableJobDescription({
      userId: auth.user.id,
      id,
      ...update,
      ...(interviewProcess === undefined ? {} : { interviewProcess }),
    });
    if (!jobDescription) {
      return mutableUpdateMissResponse(auth.user.id, id);
    }

    return NextResponse.json({ jobDescription });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
