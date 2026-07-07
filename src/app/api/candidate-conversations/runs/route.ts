import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseCandidateCommunicationRunPayload } from '@/lib/candidate-communication/api';
import {
  createCandidateCommunicationRun,
  updateCandidateCommunicationRun,
  type CandidateCommunicationRunDto,
  type CandidateCommunicationRunRecord,
  type CandidateCommunicationRunStats,
} from '@/lib/candidate-communication/repo';
import { executeSingleCandidateAction } from '@/lib/candidate-screening/runner';
import { runUnreadCandidateCommunicationSkill } from '@/lib/candidate-communication/skill-service';

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

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const parsed = parseCandidateCommunicationRunPayload(body.value);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const run = await createCandidateCommunicationRun({
      userId: auth.user.id,
      jobDescriptionId: parsed.value.jobDescriptionId ?? null,
      candidateId: parsed.value.mode === 'single' ? parsed.value.candidateId : null,
      platform: parsed.value.platform,
      mode: parsed.value.mode,
      status: 'running',
      stats: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
    });

    try {
      if (parsed.value.mode === 'batch') {
        const result = await runUnreadCandidateCommunicationSkill({
          userId: auth.user.id,
          jobDescriptionId: parsed.value.jobDescriptionId,
          platform: parsed.value.platform,
          maxPasses: parsed.value.maxPasses,
        });
        const finished =
          (await updateCandidateCommunicationRun({
            userId: auth.user.id,
            runId: run.id,
            status: 'success',
            stats: batchStats(result),
            errorMessage: null,
            finishedAt: new Date(),
          })) ?? run;
        return NextResponse.json({ run: finished }, { status: 202 });
      }

      const singleResult = parsed.value.sourceScreeningRunId
        ? await executeSingleCandidateAction({
            userId: auth.user.id,
            runId: parsed.value.sourceScreeningRunId,
            jobDescriptionId: parsed.value.jobDescriptionId,
            candidateId: parsed.value.candidateId,
          })
        : {
            status: 'success' as const,
            candidateId: parsed.value.candidateId,
            candidateName: null,
            detail: '已创建单点沟通任务',
            errorMessage: null,
          };
      const finished =
        (await updateCandidateCommunicationRun({
          userId: auth.user.id,
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
        })) ?? run;
      return NextResponse.json({ run: finished }, { status: 202 });
    } catch (error) {
      const failed = await markRunFailed({ userId: auth.user.id, run, error });
      return NextResponse.json({ run: failed }, { status: 202 });
    }
  } catch (error) {
    return serverErrorResponse(error);
  }
}
