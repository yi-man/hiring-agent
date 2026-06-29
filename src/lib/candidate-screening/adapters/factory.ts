import { createBrowserExecutorFromEnv } from '@/lib/jd-publishing/executors/browser-executor-factory';
import { BossLikeCandidateSourceAdapter } from './boss-like';
import type { CandidateSourceAdapter } from './types';
import type { CandidateScreeningPlatform } from '../types';

export function createCandidateSourceAdapter(
  platform: CandidateScreeningPlatform,
): CandidateSourceAdapter {
  if (platform !== 'boss-like') {
    throw new Error(`unsupported candidate source platform: ${platform}`);
  }

  return new BossLikeCandidateSourceAdapter({ executor: createBrowserExecutorFromEnv() });
}
