import type { JobDescriptionDto } from '@/types';
import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import { runPublishingAgentGraph } from './graph';
import type { BrowserExecutor } from '@/lib/browser/types';
import type { PublishJobDescriptionSettings, PublishTaskResult } from './types';

const DEFAULT_BOSS_LIKE_BASE_URL = 'http://localhost:6183';
const DEFAULT_BOSS_LIKE_USERNAME = 'admin';
const DEFAULT_BOSS_LIKE_PASSWORD = 'boss123';

function allowsLocalBossLikeDefaults(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    process.env.BOSS_LIKE_ALLOW_LOCAL_DEFAULTS === 'true'
  );
}

function readBossLikeConfig(name: string, localDefault: string): string {
  const value = process.env[name];
  if (value?.trim()) return value;
  if (allowsLocalBossLikeDefaults()) return localDefault;
  throw new Error(`${name} is required outside local test runtimes`);
}

function targetUrls(baseUrl: string): Record<string, string> {
  const normalized = baseUrl.replace(/\/+$/, '');
  return {
    loginUrl: `${normalized}/employer/login`,
    newJobUrl: `${normalized}/employer/jobs/new`,
  };
}

export async function publishJobDescriptionToBossLike(options: {
  jobDescription: JobDescriptionDto;
  settings: PublishJobDescriptionSettings;
  executor?: BrowserExecutor;
}): Promise<PublishTaskResult> {
  const { jobDescription, settings } = options;
  const baseUrl = readBossLikeConfig('BOSS_LIKE_BASE_URL', DEFAULT_BOSS_LIKE_BASE_URL);
  const credentials = {
    username: readBossLikeConfig('BOSS_LIKE_EMPLOYER_USERNAME', DEFAULT_BOSS_LIKE_USERNAME),
    password: readBossLikeConfig('BOSS_LIKE_EMPLOYER_PASSWORD', DEFAULT_BOSS_LIKE_PASSWORD),
  };
  const executor =
    options.executor ??
    createBrowserExecutorFromEnv(process.env, {
      userId: jobDescription.userId,
    });
  const shouldCloseExecutor = !options.executor;

  try {
    return await runPublishingAgentGraph({
      jobDescription,
      settings,
      executor,
      credentials,
      target: targetUrls(baseUrl),
    });
  } finally {
    if (shouldCloseExecutor) {
      await executor.close?.();
    }
  }
}
