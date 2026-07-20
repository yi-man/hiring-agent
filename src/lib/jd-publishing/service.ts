import type { JobDescriptionDto } from '@/types';
import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import { runPublishingAgentGraph } from './graph';
import type { BrowserExecutor } from '@/lib/browser/types';
import type { PublishJobDescriptionSettings, PublishTaskResult } from './types';
import { resolveRecruitmentPlatformRuntimeConfig } from '@/lib/recruitment-platform-config';

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

function targetUrls(baseUrl: string, variables: Record<string, string>): Record<string, string> {
  const normalized = baseUrl.replace(/\/+$/, '');
  return {
    loginUrl: joinUrl(normalized, variables.loginPath || '/'),
    newJobUrl: joinUrl(normalized, variables.newJobPath || '/'),
    jobsListUrl: joinUrl(normalized, variables.jobsListPath || '/'),
    loginSuccessUrl: joinUrl(normalized, variables.loginSuccessPath || '/'),
  };
}

export async function publishJobDescription(options: {
  jobDescription: JobDescriptionDto;
  batchId: string;
  settings: PublishJobDescriptionSettings;
  executor?: BrowserExecutor;
}): Promise<PublishTaskResult> {
  const { jobDescription, settings } = options;
  const config = await resolveRecruitmentPlatformRuntimeConfig({
    userId: jobDescription.userId,
    platform: settings.platform,
  });
  const executor =
    options.executor ??
    createBrowserExecutorFromEnv(process.env, {
      userId: jobDescription.userId,
    });
  const shouldCloseExecutor = !options.executor;

  try {
    return await runPublishingAgentGraph({
      jobDescription,
      batchId: options.batchId,
      settings,
      executor,
      credentials: { username: config.username, password: config.password },
      target: targetUrls(config.baseUrl, config.variables),
      siteFingerprint: config.siteFingerprint,
    });
  } finally {
    if (shouldCloseExecutor) await executor.close?.();
  }
}

export async function publishJobDescriptionToBossLike(options: {
  jobDescription: JobDescriptionDto;
  batchId: string;
  settings: PublishJobDescriptionSettings;
  executor?: BrowserExecutor;
}): Promise<PublishTaskResult> {
  return publishJobDescription(options);
}
