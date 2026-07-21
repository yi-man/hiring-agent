import type { JobDescriptionDto } from '@/types';
import { recoverStaleJobDescriptionPublishing } from '@/lib/jd/job-description-repo';
import type { PublishJobDescriptionSettings } from './types';
import { formatPublishAutomationErrorText } from './format-error';
import { publishJobDescriptionToBossLike } from './service';
import { getRecruitmentPlatformLabel, isRecruitmentPlatform } from '@/lib/recruitment-platforms';
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
  const platformLabel = isRecruitmentPlatform(settings.platform)
    ? getRecruitmentPlatformLabel(settings.platform)
    : settings.platform;
  let settledResult: Awaited<ReturnType<typeof publishJobDescriptionToBossLike>>;

  const started = await updatePublishRun({
    userId,
    runId,
    expectedStatus: 'pending',
    status: 'running',
    currentStage: 'publishing',
    startedAt: new Date(),
  });
  if (!started) return;

  try {
    await createPublishRunEvent({
      userId,
      runId,
      stage: 'publishing',
      level: 'info',
      message: `正在发布到${platformLabel}…`,
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
      batchId: run.batchId,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '发布过程异常';
    const message = formatPublishAutomationErrorText(rawMessage);
    const failed = await updatePublishRun({
      userId,
      runId,
      expectedStatus: 'running',
      status: 'failed',
      currentStage: 'completed',
      errorMessage: message,
      finishedAt: new Date(),
    }).catch(() => null);
    if (!failed) return;

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
  let completed: Awaited<ReturnType<typeof updatePublishRun>>;
  try {
    completed = await updatePublishRun({
      userId,
      runId,
      expectedStatus: 'running',
      status: settledResult.status === 'success' ? 'success' : 'failed',
      currentStage: 'completed',
      finishedAt: new Date(),
      publishTaskId: settledResult.taskId,
      skillId: settledResult.skillId,
      ...(failureFriendly ? { errorMessage: failureFriendly } : {}),
    });
  } catch (error) {
    console.error('Failed to persist JD publish run outcome; recovering from publish task', {
      runId,
      taskId: settledResult.taskId,
      status: settledResult.status,
      error,
    });
    await recoverStaleJobDescriptionPublishing({ userId, id: jobDescriptionId }).catch(
      (recoveryError) => {
        console.error('Failed to recover JD publish run outcome from publish task', {
          runId,
          taskId: settledResult.taskId,
          recoveryError,
        });
      },
    );
    return;
  }
  if (!completed) return;

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
