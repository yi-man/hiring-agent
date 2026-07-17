import { BossLikeCandidateCommunicationAdapter } from './adapters/boss-like';
import { runCandidateCommunicationSkill } from './skill-runner';
import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';
import { candidateCommunicationSkills } from './skill-types';
import { resolveRecruitmentPlatformRuntimeConfig } from '@/lib/recruitment-platform-config';

export async function runUnreadCandidateCommunicationSkill(params: {
  userId: string;
  jobDescriptionId?: string;
  platform: CandidateScreeningPlatform;
  maxPasses?: number;
}) {
  const config = await resolveRecruitmentPlatformRuntimeConfig({
    userId: params.userId,
    platform: params.platform,
  });
  const skill = candidateCommunicationSkills[config.siteTemplatePlatform];
  const resumeListPath = config.variables.resumeListPath || '/';
  const messagePath = config.variables.messagePath || '/';

  return runCandidateCommunicationSkill({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    platform: params.platform,
    adapter: new BossLikeCandidateCommunicationAdapter({
      executor: createBrowserExecutorFromEnv(process.env, {
        defaultTimeoutMs: 10_000,
        userId: params.userId,
      }),
      platform: params.platform,
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      resumeListPath,
      communicationResumePath: resumeListPath,
      messagePath,
      threadListSelector: skill.targets.threadList,
      replyInputSelector: skill.targets.replyInput,
      sendButtonSelector: skill.targets.sendButton,
    }),
    maxPasses: params.maxPasses ?? skill.maxPasses,
  });
}
