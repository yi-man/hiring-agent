import { scheduleBackgroundTask } from '@/lib/jd/background';
import type { JobDescriptionDto } from '@/types';
import {
  createPublishRun,
  createPublishRunEvent,
  reconcilePublishBatchWithRetry,
  updatePublishRun,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';
import type { PublishJobDescriptionSettings } from './types';
import { runPublishRun } from './publish-run-runner';

export type InitializePublishRunParams = {
  userId: string;
  jobDescriptionId: string;
  jobDescription: JobDescriptionDto;
  batchId: string;
  settings: PublishJobDescriptionSettings;
};

export type InitializedPublishRun = {
  run: JobDescriptionPublishRunDto;
  jobDescription: JobDescriptionDto;
  settings: PublishJobDescriptionSettings;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function initializePublishRun(
  params: InitializePublishRunParams,
): Promise<InitializedPublishRun> {
  const run = await createPublishRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    batchId: params.batchId,
    platform: params.settings.platform,
  });

  try {
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
  } catch (error) {
    const message = `发布任务初始化失败：${errorMessage(error, '未知错误')}`;
    await updatePublishRun({
      userId: params.userId,
      runId: run.id,
      status: 'failed',
      currentStage: 'completed',
      errorMessage: message,
      finishedAt: new Date(),
    }).catch(() => {});
    throw error;
  }

  return {
    run,
    jobDescription: params.jobDescription,
    settings: params.settings,
  };
}

export async function failInitializedPublishRun(
  initialized: InitializedPublishRun,
  cause: unknown,
): Promise<void> {
  const { run } = initialized;
  const message = `同批次存在发布任务初始化失败，本任务未启动：${errorMessage(cause, '未知错误')}`;
  await updatePublishRun({
    userId: run.userId,
    runId: run.id,
    status: 'failed',
    currentStage: 'completed',
    errorMessage: message,
    finishedAt: new Date(),
  });

  await createPublishRunEvent({
    userId: run.userId,
    runId: run.id,
    stage: 'completed',
    level: 'error',
    message: '发布任务未启动',
    detail: { error: message },
  }).catch(() => {});
}

async function executePublishRun(initialized: InitializedPublishRun): Promise<void> {
  const { run, jobDescription, settings } = initialized;
  try {
    await runPublishRun({ run, jobDescription, settings });
  } catch (error) {
    await updatePublishRun({
      userId: run.userId,
      runId: run.id,
      status: 'failed',
      currentStage: 'completed',
      errorMessage: errorMessage(error, '发布任务启动失败'),
      finishedAt: new Date(),
    }).catch(() => {});
    await reconcilePublishBatchWithRetry({
      userId: run.userId,
      id: run.jobDescriptionId,
      batchId: run.batchId,
      mode: 'batch',
      result: 'failed',
    }).catch(() => {});
    throw error;
  }
}

export function schedulePublishRuns(initializedRuns: InitializedPublishRun[]): void {
  if (initializedRuns.length === 0) return;

  scheduleBackgroundTask(
    async () => {
      const settledRuns = await Promise.allSettled(
        initializedRuns.map((initialized) => executePublishRun(initialized)),
      );
      const failedRun = settledRuns.find((result) => result.status === 'rejected');
      if (failedRun?.status === 'rejected') throw failedRun.reason;
    },
    (error) => {
      console.error('JD publish batch failed', {
        runIds: initializedRuns.map((initialized) => initialized.run.id),
        error,
      });
    },
  );
}
