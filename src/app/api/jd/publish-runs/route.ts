import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parsePublishJobDescriptionPayload } from '@/lib/jd-publishing/publish-payload';
import {
  failInitializedPublishRun,
  initializePublishRun,
  schedulePublishRuns,
} from '@/lib/jd-publishing/publish-run-service';
import { claimJobDescriptionForPublishing } from '@/lib/jd/job-description-repo';
import { reconcilePublishBatchWithRetry } from '@/lib/jd-publishing/publish-run-repo';
import { getCompanyProfileForUser } from '@/lib/company-profile/repo';
import {
  getRecruitmentPlatformLabel,
  resolveRecruitmentPlatforms,
} from '@/lib/recruitment-platforms';
import {
  findDuplicateRecruitmentPlatformTarget,
  resolveRecruitmentPlatformRuntimeConfigs,
} from '@/lib/recruitment-platform-config';

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
    const runtimeConfigs = await resolveRecruitmentPlatformRuntimeConfigs({
      userId: auth.user.id,
      platforms,
    });
    const duplicateTarget = findDuplicateRecruitmentPlatformTarget(runtimeConfigs);
    if (duplicateTarget) {
      const [first, second] = duplicateTarget.map(getRecruitmentPlatformLabel);
      return badRequest(`${first}与 ${second} 指向同一招聘站点，请只保留一个平台后再发布`);
    }

    const batchId = randomUUID();
    const claim = await claimJobDescriptionForPublishing({
      userId: auth.user.id,
      id,
      batchId,
    });
    if (!claim.ok && claim.reason === 'not_found') {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }
    if (!claim.ok && claim.reason === 'conflict') {
      return conflict(claim.conflict ?? 'job description cannot be published');
    }
    if (!claim.ok) return conflict('job description status changed, please retry');

    const settledRuns = await Promise.allSettled(
      settings.map((platformSettings) =>
        initializePublishRun({
          userId: auth.user.id,
          jobDescriptionId: id,
          jobDescription: claim.jobDescription,
          batchId,
          settings: platformSettings,
        }),
      ),
    );
    const failedRun = settledRuns.find((result) => result.status === 'rejected');
    const initializedRuns = settledRuns.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (failedRun?.status === 'rejected') {
      await Promise.allSettled(
        initializedRuns.map((initialized) =>
          failInitializedPublishRun(initialized, failedRun.reason),
        ),
      );
      await reconcilePublishBatchWithRetry({
        userId: auth.user.id,
        id,
        batchId,
        mode: 'batch',
        result: 'failed',
      }).catch(() => {});
      throw failedRun.reason;
    }

    schedulePublishRuns(initializedRuns);
    const runs = initializedRuns.map((initialized) => initialized.run);

    return NextResponse.json({ run: runs[0], runs }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
