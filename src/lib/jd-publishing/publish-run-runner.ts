import type { JobDescriptionDto } from '@/types';
import type { PublishJobDescriptionSettings } from './types';
import { formatPublishAutomationErrorText } from './format-error';
import { publishJobDescriptionToBossLike } from './service';
import {
  updatePublishRun,
  createPublishRunEvent,
  reconcilePublishBatchWithRetry,
  type JobDescriptionPublishRunDto,
} from './publish-run-repo';

export async function runPublishRun(params: {
  run: JobDescriptionPublishRunDto;
  jobDescription: JobDescriptionDto;
  settings: PublishJobDescriptionSettings;
}): Promise<void> {
  const { run, jobDescription, settings } = params;
  const runId = run.id;
  const userId = run.userId;
  const jobDescriptionId = jobDescription.id;
  let settledResult: Awaited<ReturnType<typeof publishJobDescriptionToBossLike>>;

  try {
    await updatePublishRun({
      userId,
      runId,
      status: 'running',
      currentStage: 'publishing',
      startedAt: new Date(),
    });

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'publishing',
      level: 'info',
      message: '正在发布到 BOSS 直聘…',
      detail: {
        platform: settings.platform,
        company: settings.company,
        salary: settings.salary,
        location: settings.location,
      },
    });

    settledResult = await publishJobDescriptionToBossLike({
      jobDescription,
      settings,
    });

    const failureRaw =
      settledResult.status === 'failed'
        ? (settledResult.trace.steps.at(-1)?.result.error ?? '未知错误')
        : null;
    const failureFriendly = failureRaw ? formatPublishAutomationErrorText(failureRaw) : null;
    await updatePublishRun({
      userId,
      runId,
      status: settledResult.status === 'success' ? 'success' : 'failed',
      currentStage: 'completed',
      finishedAt: new Date(),
      publishTaskId: settledResult.taskId,
      skillId: settledResult.skillId,
      ...(failureFriendly ? { errorMessage: failureFriendly } : {}),
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '发布过程异常';
    const message = formatPublishAutomationErrorText(rawMessage);
    await updatePublishRun({
      userId,
      runId,
      status: 'failed',
      currentStage: 'completed',
      errorMessage: message,
      finishedAt: new Date(),
    }).catch(() => {});

    await reconcilePublishBatchWithRetry({
      userId,
      id: jobDescriptionId,
      batchId: run.batchId,
      mode: 'batch',
      result: 'failed',
    }).catch((reconcileError) => {
      console.error('Failed to reconcile failed JD publish batch', { runId, reconcileError });
    });

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'completed',
      level: 'error',
      message: '发布失败',
      detail: { error: message, technical: rawMessage },
    }).catch(() => {});
    return;
  }

  const failureRaw =
    settledResult.status === 'failed'
      ? (settledResult.trace.steps.at(-1)?.result.error ?? '未知错误')
      : null;
  const failureFriendly = failureRaw ? formatPublishAutomationErrorText(failureRaw) : null;
  await reconcilePublishBatchWithRetry({
    userId,
    id: jobDescriptionId,
    batchId: run.batchId,
    mode: 'batch',
    result: settledResult.status === 'success' ? 'success' : 'failed',
  }).catch((error) => {
    console.error('Failed to reconcile JD publish batch', { runId, error });
  });

  await createPublishRunEvent({
    userId,
    runId,
    stage: 'completed',
    level: settledResult.status === 'success' ? 'success' : 'error',
    message: settledResult.status === 'success' ? '发布成功' : '发布失败',
    detail:
      settledResult.status === 'failed'
        ? { error: failureFriendly, technical: failureRaw }
        : { taskId: settledResult.taskId, stepCount: settledResult.trace.steps.length },
  }).catch((error) => {
    console.error('Failed to record JD publish completion event', { runId, error });
  });
}
