import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  parseCandidateCommunicationRunPayload,
  type CandidateCommunicationRunPayload,
} from '@/lib/candidate-communication/api';
import {
  createCandidateCommunicationRun,
  updateCandidateCommunicationRun,
  type CandidateCommunicationRunDto,
  type CandidateCommunicationRunRecord,
  type CandidateCommunicationRunStats,
} from '@/lib/candidate-communication/repo';
import { executeSingleCandidateAction } from '@/lib/candidate-screening/runner';
import { runUnreadCandidateCommunicationSkill } from '@/lib/candidate-communication/skill-service';
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

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: 'invalid JSON body' };
  }
}

function batchStats(result: {
  processed: number;
  failed: number;
  passes: number;
}): CandidateCommunicationRunStats {
  const total = result.processed + result.failed;
  return {
    total,
    selected: result.processed,
    processed: result.processed,
    failed: result.failed,
    passes: result.passes,
    records: [],
  };
}

function singleStats(record: CandidateCommunicationRunRecord): CandidateCommunicationRunStats {
  const failed = record.status === 'failed' ? 1 : 0;
  const processed = record.status === 'success' ? 1 : 0;
  return {
    total: 1,
    selected: 1,
    processed,
    failed,
    records: [record],
  };
}

async function markRunFailed(params: {
  userId: string;
  run: CandidateCommunicationRunDto;
  error: unknown;
}): Promise<CandidateCommunicationRunDto> {
  const message = params.error instanceof Error ? params.error.message : 'Unknown server error';
  return (
    (await updateCandidateCommunicationRun({
      userId: params.userId,
      runId: params.run.id,
      status: 'failed',
      stats: {
        total: 0,
        selected: 0,
        processed: 0,
        failed: 1,
        records: [],
      },
      errorMessage: message,
      finishedAt: new Date(),
    })) ?? params.run
  );
}

async function executeRun(
  userId: string,
  payload: CandidateCommunicationRunPayload,
): Promise<CandidateCommunicationRunDto> {
  const run = await createCandidateCommunicationRun({
    userId,
    jobDescriptionId: payload.jobDescriptionId ?? null,
    candidateId: payload.mode === 'single' ? payload.candidateId : null,
    platform: payload.platform,
    mode: payload.mode,
    status: 'running',
    stats: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
  });

  try {
    if (payload.mode === 'batch') {
      const result = await runUnreadCandidateCommunicationSkill({
        userId,
        jobDescriptionId: payload.jobDescriptionId,
        platform: payload.platform,
        maxPasses: payload.maxPasses,
      });
      return (
        (await updateCandidateCommunicationRun({
          userId,
          runId: run.id,
          status: 'success',
          stats: batchStats(result),
          errorMessage: null,
          finishedAt: new Date(),
        })) ?? run
      );
    }

    const singleResult = payload.sourceScreeningRunId
      ? await executeSingleCandidateAction({
          userId,
          runId: payload.sourceScreeningRunId,
          jobDescriptionId: payload.jobDescriptionId,
          candidateId: payload.candidateId,
        })
      : {
          status: 'success' as const,
          candidateId: payload.candidateId,
          candidateName: null,
          detail: '已创建单点沟通任务',
          errorMessage: null,
        };
    return (
      (await updateCandidateCommunicationRun({
        userId,
        runId: run.id,
        status: singleResult.status,
        stats: singleStats({
          candidateId: singleResult.candidateId,
          candidateName: singleResult.candidateName,
          status: singleResult.status,
          detail: singleResult.detail,
        }),
        errorMessage: singleResult.errorMessage ?? null,
        finishedAt: new Date(),
      })) ?? run
    );
  } catch (error) {
    return markRunFailed({ userId, run, error });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const requestBody =
      body.value && typeof body.value === 'object' ? (body.value as Record<string, unknown>) : {};
    const hasPlatformOverride =
      requestBody.platform !== undefined || requestBody.platforms !== undefined;
    const profile = hasPlatformOverride ? null : await getCompanyProfileForUser(auth.user.id);
    const platforms = resolveRecruitmentPlatforms(requestBody, profile?.supportedPlatforms);
    if (platforms.length === 0) {
      return badRequest('at least one recruitment platform is required');
    }
    const parsedPayloads = platforms.map((platform) =>
      parseCandidateCommunicationRunPayload({ ...requestBody, platform }),
    );
    const invalid = parsedPayloads.find((parsed) => !parsed.ok);
    if (invalid && !invalid.ok) return badRequest(invalid.error);
    const payloads = parsedPayloads.flatMap((parsed) => (parsed.ok ? [parsed.value] : []));
    const runs = await Promise.all(payloads.map((payload) => executeRun(auth.user.id, payload)));
    return NextResponse.json({ run: runs[0], runs }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
