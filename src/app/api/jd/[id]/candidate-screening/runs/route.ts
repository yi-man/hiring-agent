import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseCreateScreeningRunPayload } from '@/lib/candidate-screening/api';
import {
  listCandidateScreeningRuns,
  type CandidateScreeningRunDto,
} from '@/lib/candidate-screening/repo';
import { createAndStartCandidateScreeningRun } from '@/lib/candidate-screening/service';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import { getCompanyProfileForUser } from '@/lib/company-profile/repo';
import { resolveRecruitmentPlatforms } from '@/lib/recruitment-platforms';

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

function isEligibleForScreening(status: string): boolean {
  return status === 'published' || status === 'ready_to_publish';
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const requestBody = body.value;
    const requestRecord =
      requestBody && typeof requestBody === 'object'
        ? (requestBody as { platform?: unknown; platforms?: unknown })
        : {};
    const hasPlatformOverride =
      requestRecord.platform !== undefined || requestRecord.platforms !== undefined;
    const profile = hasPlatformOverride ? null : await getCompanyProfileForUser(auth.user.id);
    const platforms = resolveRecruitmentPlatforms(requestRecord, profile?.supportedPlatforms);
    if (platforms.length === 0) {
      return badRequest('at least one recruitment platform is required');
    }
    const parsedRequests = platforms.map((platform) =>
      parseCreateScreeningRunPayload({
        ...(requestBody && typeof requestBody === 'object' ? requestBody : {}),
        platform,
      }),
    );
    const invalid = parsedRequests.find((parsed) => !parsed.ok);
    if (invalid && !invalid.ok) return badRequest(invalid.error);
    const requests = parsedRequests.flatMap((parsed) => (parsed.ok ? [parsed.value] : []));

    const jobDescription = await getJobDescriptionById(auth.user.id, id);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }
    if (!isEligibleForScreening(jobDescription.status)) {
      return NextResponse.json(
        { error: 'job description is not eligible for screening' },
        { status: 409 },
      );
    }
    if (jobDescription.hiringTarget === null) {
      return NextResponse.json(
        { error: 'hiring target is required before screening' },
        { status: 409 },
      );
    }
    if (jobDescription.onboardedCount >= jobDescription.hiringTarget) {
      return NextResponse.json(
        { error: 'hiring target has already been reached' },
        { status: 409 },
      );
    }
    const runs = await Promise.all(
      requests.map((screeningRequest) =>
        createAndStartCandidateScreeningRun({
          userId: auth.user.id,
          jobDescription,
          request: screeningRequest,
        }),
      ),
    );

    return NextResponse.json({ run: runs[0], runs }, { status: 202 });
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

    const jobDescription = await getJobDescriptionById(auth.user.id, id);
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    const runs: CandidateScreeningRunDto[] = await listCandidateScreeningRuns({
      userId: auth.user.id,
      jobDescriptionId: id,
    });

    return NextResponse.json({ runs });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
