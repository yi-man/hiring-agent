import {
  createJobDescriptionCreateRun,
  createJobDescriptionCreateRunEvent,
  type JobDescriptionCreateRunDto,
} from './create-run-repo';
import { runJobDescriptionCreateRun } from './create-run-runner';
import type { CreateJobDescriptionRequest } from '@/types';

export async function createAndStartJobDescriptionCreateRun(params: {
  userId: string;
  request: CreateJobDescriptionRequest;
}): Promise<JobDescriptionCreateRunDto> {
  const run = await createJobDescriptionCreateRun({
    userId: params.userId,
    request: params.request,
    status: 'pending',
    currentStage: 'queued',
  });

  await createJobDescriptionCreateRunEvent({
    userId: params.userId,
    runId: run.id,
    stage: 'queued',
    level: 'info',
    message: 'JD 生成任务已创建',
    detail: {
      department: params.request.department,
      position: params.request.position,
      salaryRange: params.request.salaryRange,
      workLocations: params.request.workLocations,
    },
  });

  void runJobDescriptionCreateRun({ userId: params.userId, runId: run.id }).catch(
    (error: unknown) => {
      console.error('JD create run failed', { runId: run.id, error });
    },
  );

  return run;
}
