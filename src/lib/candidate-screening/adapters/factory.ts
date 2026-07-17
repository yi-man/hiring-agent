import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import { BossLikeCandidateSourceAdapter } from './boss-like';
import type { CandidateSourceAdapter } from './types';
import type { CandidateScreeningPlatform } from '../types';
import { resolveRecruitmentPlatformRuntimeConfig } from '@/lib/recruitment-platform-config';

export type CandidateSourceAdapterFactoryOptions = {
  userId?: string;
};

export async function createCandidateSourceAdapter(
  platform: CandidateScreeningPlatform,
  options: CandidateSourceAdapterFactoryOptions = {},
): Promise<CandidateSourceAdapter> {
  if (!options.userId) throw new Error('userId is required for recruitment platform configuration');
  const config = await resolveRecruitmentPlatformRuntimeConfig({
    userId: options.userId,
    platform,
  });
  return new BossLikeCandidateSourceAdapter({
    platform,
    executor: createBrowserExecutorFromEnv(process.env, {
      userId: options.userId,
    }),
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    resumeListPath: config.variables.resumeListPath || '/',
  });
}
