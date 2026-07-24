import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { createAndStartJobDescriptionCreateRun } from '@/lib/jd/create-run-service';
import {
  failStaleJobDescriptionCreateRuns,
  listJobDescriptionCreateRuns,
} from '@/lib/jd/create-run-repo';
import { parseCreateJobDescriptionPayload } from '@/lib/jd/api';
import {
  getAutoMatchedCompanyInterviewProcessForUser,
  getCompanyInterviewProcessForUser,
} from '@/lib/company-profile/repo';

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

function parseLimit(value: string | null): number {
  const parsed = Number(value || '10');
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(50, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const jobDescriptionId = searchParams.get('jobDescriptionId')?.trim() || undefined;
    await failStaleJobDescriptionCreateRuns({ userId: auth.user.id });
    const runs = await listJobDescriptionCreateRuns({
      userId: auth.user.id,
      jobDescriptionId,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ runs });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = parseCreateJobDescriptionPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }
    const interviewProcess = parsed.value.interviewProcessId
      ? await getCompanyInterviewProcessForUser(auth.user.id, parsed.value.interviewProcessId)
      : await getAutoMatchedCompanyInterviewProcessForUser({
          userId: auth.user.id,
          department: parsed.value.department,
          position: parsed.value.position,
          positionDescription: parsed.value.positionDescription,
        });
    if (!interviewProcess) {
      return badRequest(
        parsed.value.interviewProcessId
          ? 'interview process is invalid'
          : 'no interview process matched this job',
      );
    }
    const run = await createAndStartJobDescriptionCreateRun({
      userId: auth.user.id,
      request: parsed.value,
      interviewProcess,
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
