import {
  createJobDescriptionRegenerateRun,
  createJobDescriptionRegenerateRunEvent,
  type JobDescriptionRegenerateRunDto,
} from './regenerate-run-repo';
import { runJobDescriptionRegenerateRun } from './regenerate-run-runner';
import { scheduleBackgroundTask } from './background';
import type { JD, JDTone } from '@/types';

export async function createAndStartJobDescriptionRegenerateRun(params: {
  userId: string;
  jobDescriptionId: string;
  tone: JDTone;
  extraInstruction: string;
  currentJd: JD;
}): Promise<JobDescriptionRegenerateRunDto> {
  const run = await createJobDescriptionRegenerateRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    tone: params.tone,
    extraInstruction: params.extraInstruction,
    currentJd: params.currentJd,
    status: 'pending',
    currentStage: 'queued',
  });

  await createJobDescriptionRegenerateRunEvent({
    userId: params.userId,
    runId: run.id,
    jobDescriptionId: params.jobDescriptionId,
    stage: 'queued',
    level: 'info',
    message: 'JD 重新生成任务已创建',
    detail: {
      tone: params.tone,
      extraInstruction: params.extraInstruction,
    },
  });

  scheduleBackgroundTask(
    () => runJobDescriptionRegenerateRun({ userId: params.userId, runId: run.id }),
    (error) => {
      console.error('JD regenerate run failed', { runId: run.id, error });
    },
  );

  return run;
}
