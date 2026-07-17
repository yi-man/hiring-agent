import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parsePublishJobDescriptionPayload } from '@/lib/jd-publishing/publish-payload';
import { createAndStartPublishRun } from '@/lib/jd-publishing/publish-run-service';
import { updateJobDescription } from '@/lib/jd/job-description-repo';
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

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const { id } = body;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const hasPlatformOverride = body.platform !== undefined || body.platforms !== undefined;
    const profile = hasPlatformOverride ? null : await getCompanyProfileForUser(auth.user.id);
    const platforms = resolveRecruitmentPlatforms(body, profile?.supportedPlatforms);
    if (platforms.length === 0) {
      return badRequest('at least one recruitment platform is required');
    }
    const parsedSettings = platforms.map((platform) =>
      parsePublishJobDescriptionPayload({ ...body, platform }),
    );
    const invalid = parsedSettings.find((parsed) => !parsed.ok);
    if (invalid && !invalid.ok) return badRequest(invalid.error);
    const settings = parsedSettings.flatMap((parsed) => (parsed.ok ? [parsed.value] : []));

    await updateJobDescription({
      userId: auth.user.id,
      id,
      status: 'ready_to_publish',
    });

    const runs = await Promise.all(
      settings.map((platformSettings) =>
        createAndStartPublishRun({
          userId: auth.user.id,
          jobDescriptionId: id,
          settings: platformSettings,
        }),
      ),
    );

    return NextResponse.json({ run: runs[0], runs }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
