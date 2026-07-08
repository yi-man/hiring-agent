import { BossLikeCandidateCommunicationAdapter } from './adapters/boss-like';
import { runCandidateCommunicationSkill } from './skill-runner';
import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

export async function runUnreadCandidateCommunicationSkill(params: {
  userId: string;
  jobDescriptionId?: string;
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
      executor: createBrowserExecutorFromEnv(process.env, { defaultTimeoutMs: 10_000 }),
    }),
    maxPasses: params.maxPasses,
  });
}
