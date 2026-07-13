import { scheduleBackgroundTask } from '@/lib/jd/background';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import {
  createPublishRun,
  createPublishRunEvent,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';
import type { PublishJobDescriptionSettings } from './types';
import { runPublishRun } from './publish-run-runner';

export async function createAndStartPublishRun(params: {
  userId: string;
  jobDescriptionId: string;
  settings: PublishJobDescriptionSettings;
}): Promise<JobDescriptionPublishRunDto> {
  const run = await createPublishRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    platform: params.settings.platform,
  });

  await createPublishRunEvent({
    userId: params.userId,
    runId: run.id,
    stage: 'queued',
    level: 'info',
    message: '发布任务已创建',
    detail: {
      platform: params.settings.platform,
      company: params.settings.company,
      salary: params.settings.salary,
      location: params.settings.location,
    },
  });

  scheduleBackgroundTask(
    async () => {
      const jobDescription = await getJobDescriptionById(params.userId, params.jobDescriptionId);
      if (!jobDescription) {
        throw new Error(`JD ${params.jobDescriptionId} not found`);
      }

      await runPublishRun({
        run,
        jobDescription,
        settings: params.settings,
      });
    },
    (error) => {
      console.error('JD publish run failed', { runId: run.id, error });
    },
  );

  return run;
}
