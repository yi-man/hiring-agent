import { runCandidateScreening } from './runner';
import { createCandidateScreeningRun, type CandidateScreeningRunDto } from './repo';
import type { CreateScreeningRunRequest, ScreeningRunStats } from './types';
import type { JobDescriptionDto } from '@/types';

function createEmptyStats(): ScreeningRunStats {
  return {
    fetched: 0,
    deduped: 0,
    stored: 0,
    vectorRecalled: 0,
    evaluated: 0,
    recommendedChat: 0,
    recommendedCollect: 0,
    skipped: 0,
    failed: 0,
  };
}

export async function createAndStartCandidateScreeningRun(params: {
  userId: string;
  jobDescription: JobDescriptionDto;
  request: CreateScreeningRunRequest;
}): Promise<CandidateScreeningRunDto> {
  const run = await createCandidateScreeningRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescription.id,
    platform: params.request.platform,
    mode: params.request.mode,
    status: 'pending',
    stats: createEmptyStats(),
  });

  void runCandidateScreening({
    runId: run.id,
    userId: params.userId,
    jobDescription: params.jobDescription,
    request: params.request,
  });

  return run;
}
