import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import { BossLikeCandidateSourceAdapter } from './boss-like';
import type { CandidateSourceAdapter } from './types';
import type { CandidateScreeningPlatform } from '../types';

export type CandidateSourceAdapterFactoryOptions = {
  userId?: string;
};

export function createCandidateSourceAdapter(
  platform: CandidateScreeningPlatform,
  options: CandidateSourceAdapterFactoryOptions = {},
): CandidateSourceAdapter {
  if (platform !== 'boss-like') {
    throw new Error(`unsupported candidate source platform: ${platform}`);
  }

  return new BossLikeCandidateSourceAdapter({
    executor: createBrowserExecutorFromEnv(process.env, {
      userId: options.userId,
    }),
  });
}
