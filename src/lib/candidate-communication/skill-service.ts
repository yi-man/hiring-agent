import { BossLikeCandidateCommunicationAdapter } from './adapters/boss-like';
import { runCandidateCommunicationSkill } from './skill-runner';
import { PlaywrightBrowserExecutor } from '@/lib/jd-publishing/executors/playwright-executor';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

export async function runUnreadCandidateCommunicationSkill(params: {
  userId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  maxPasses?: number;
}) {
  if (params.platform !== 'boss-like') {
    throw new Error('platform is invalid');
  }

  return runCandidateCommunicationSkill({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    platform: params.platform,
    adapter: new BossLikeCandidateCommunicationAdapter({
      executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 10_000 }),
    }),
    maxPasses: params.maxPasses,
  });
}
