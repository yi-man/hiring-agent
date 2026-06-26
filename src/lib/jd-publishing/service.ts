import type { JobDescriptionDto } from '@/types';
import { PlaywrightBrowserExecutor } from './executors/playwright-executor';
import {
  completePublishTask,
  createPublishTask,
  getActivePublishSkillFromDb,
  upsertDefaultPublishSkill,
} from './publish-repo';
import { buildBossLikeJobPayload } from './publish-payload';
import { bossLikePublishSkill, getActivePublishSkill } from './skill-registry';
import { runPublishingSkill } from './skill-executor';
import type {
  BrowserExecutor,
  PublishJobDescriptionSettings,
  PublishPlatform,
  PublishSkill,
  PublishTaskResult,
  PublishTraceStep,
} from './types';

const DEFAULT_BOSS_LIKE_BASE_URL = 'http://localhost:6183';

function targetUrls(baseUrl: string): Record<string, string> {
  const normalized = baseUrl.replace(/\/+$/, '');
  return {
    loginUrl: `${normalized}/employer/login`,
    newJobUrl: `${normalized}/employer/jobs/new`,
  };
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

async function resolveActivePublishSkill(platform: PublishPlatform): Promise<PublishSkill> {
  if (platform === 'boss-like') {
    await upsertDefaultPublishSkill(bossLikePublishSkill);
  }
  return (await getActivePublishSkillFromDb(platform)) ?? getActivePublishSkill(platform);
}

function failedResult(params: {
  taskId: string;
  skillId: string;
  error: unknown;
}): PublishTaskResult {
  const message = params.error instanceof Error ? params.error.message : 'Unknown browser error';
  const steps: PublishTraceStep[] = [
    {
      stepId: 'runtime_exception',
      action: 'exception',
      params: {},
      result: { success: false, error: message },
    },
  ];
  return {
    taskId: params.taskId,
    skillId: params.skillId,
    status: 'failed',
    trace: {
      taskId: params.taskId,
      skillId: params.skillId,
      status: 'failed',
      steps,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function publishJobDescriptionToBossLike(options: {
  jobDescription: JobDescriptionDto;
  settings: PublishJobDescriptionSettings;
  executor?: BrowserExecutor;
}): Promise<PublishTaskResult> {
  const { jobDescription, settings } = options;
  const skill = await resolveActivePublishSkill(settings.platform);
  const input = buildBossLikeJobPayload(jobDescription, settings);
  const task = await createPublishTask({
    userId: jobDescription.userId,
    jobDescriptionId: jobDescription.id,
    skillId: skill.id,
    platform: settings.platform,
    input,
    currentStep: skill.steps[0]?.id ?? null,
  });
  const executor =
    options.executor ??
    new PlaywrightBrowserExecutor({
      apiBaseUrl: optionalEnv('BOSS_LIKE_API_BASE_URL'),
    });
  const shouldCloseExecutor = !options.executor;
  const baseUrl = process.env.BOSS_LIKE_BASE_URL || DEFAULT_BOSS_LIKE_BASE_URL;

  try {
    const result = await runPublishingSkill({
      taskId: task.id,
      skill,
      executor,
      context: {
        input,
        credentials: {
          username: process.env.BOSS_LIKE_EMPLOYER_USERNAME || 'admin',
          password: process.env.BOSS_LIKE_EMPLOYER_PASSWORD || 'boss123',
        },
        target: targetUrls(baseUrl),
      },
    });
    await completePublishTask({
      taskId: task.id,
      skillId: skill.id,
      status: result.status,
      steps: result.trace.steps,
      errorMessage: result.trace.steps.at(-1)?.result.error ?? null,
    });
    return result;
  } catch (error) {
    const result = failedResult({ taskId: task.id, skillId: skill.id, error });
    await completePublishTask({
      taskId: task.id,
      skillId: skill.id,
      status: 'failed',
      steps: result.trace.steps,
      errorMessage: result.trace.steps[0]?.result.error ?? null,
    });
    return result;
  } finally {
    if (shouldCloseExecutor) {
      await executor.close?.();
    }
  }
}
