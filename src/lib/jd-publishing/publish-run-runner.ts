import type { JobDescriptionDto } from '@/types';
import type { PublishJobDescriptionSettings } from './types';
import { publishJobDescriptionToBossLike } from './service';
import {
  updatePublishRun,
  createPublishRunEvent,
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

    const result = await publishJobDescriptionToBossLike({
      jobDescription,
      settings,
    });

    await updatePublishRun({
      userId,
      runId,
      status: result.status === 'success' ? 'success' : 'failed',
      currentStage: 'completed',
      finishedAt: new Date(),
      publishTaskId: result.taskId,
      skillId: result.skillId,
    });

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'completed',
      level: result.status === 'success' ? 'success' : 'error',
      message: result.status === 'success' ? '发布成功' : '发布失败',
      detail:
        result.status === 'failed'
          ? { error: result.trace.steps.at(-1)?.result.error ?? '未知错误' }
          : { taskId: result.taskId, stepCount: result.trace.steps.length },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布过程异常';
    await updatePublishRun({
      userId,
      runId,
      status: 'failed',
      currentStage: 'completed',
      errorMessage: message,
      finishedAt: new Date(),
    }).catch(() => {});

    await createPublishRunEvent({
      userId,
      runId,
      stage: 'completed',
      level: 'error',
      message: '发布异常',
      detail: { error: message },
    }).catch(() => {});
  }
}
