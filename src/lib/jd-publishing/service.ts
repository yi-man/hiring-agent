import type { JobDescriptionDto } from '@/types';
import { PlaywrightBrowserExecutor } from './executors/playwright-executor';
import { runPublishingAgentGraph } from './graph';
import type { BrowserExecutor, PublishJobDescriptionSettings, PublishTaskResult } from './types';

const DEFAULT_BOSS_LIKE_BASE_URL = 'http://localhost:6183';

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
  const executor = options.executor ?? new PlaywrightBrowserExecutor();
  const shouldCloseExecutor = !options.executor;
  const baseUrl = process.env.BOSS_LIKE_BASE_URL || DEFAULT_BOSS_LIKE_BASE_URL;

  try {
    return await runPublishingAgentGraph({
      jobDescription,
      settings,
      executor,
      credentials: {
        username: process.env.BOSS_LIKE_EMPLOYER_USERNAME || 'admin',
        password: process.env.BOSS_LIKE_EMPLOYER_PASSWORD || 'boss123',
      },
      target: targetUrls(baseUrl),
    });
  } finally {
    if (shouldCloseExecutor) {
      await executor.close?.();
    }
  }
}
