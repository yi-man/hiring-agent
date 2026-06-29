import { createEmptyStats, runCandidateScreening } from './runner';
import { createCandidateScreeningRun, type CandidateScreeningRunDto } from './repo';
import type { CreateScreeningRunRequest } from './types';
import type { JobDescriptionDto } from '@/types';

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
  }).catch((error: unknown) => {
    console.error('Candidate screening run failed', { runId: run.id, error });
  });

  return run;
}
