import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';
import { handleCandidateMessage, type HandleCandidateMessageResult } from './service';
import {
  bossLikeUnreadCommunicationSkill,
  type CandidateCommunicationSkillAdapter,
  type CandidateCommunicationSkillResult,
  type UnreadCandidateMessage,
} from './skill-types';
import {
  prismaCandidateConversationRepository,
  type CandidateConversationRepository,
} from './repo';

type HandleMessage = typeof handleCandidateMessage;

export type RunCandidateCommunicationSkillParams = {
  userId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  adapter: CandidateCommunicationSkillAdapter;
  repo?: CandidateConversationRepository;
  handleMessage?: HandleMessage;
  maxPasses?: number;
};

async function resolveCandidateId(params: {
  repo: CandidateConversationRepository;
  userId: string;
  platform: CandidateScreeningPlatform;
  message: UnreadCandidateMessage;
}): Promise<string> {
  const resolved = await params.repo.resolveCandidateForPlatformMessage({
    userId: params.userId,
    platform: params.platform,
    platformCandidateId: params.message.platformCandidateId ?? null,
    profileUrl: params.message.profileUrl ?? null,
  });
  if (!resolved) {
    throw new Error(`candidate not found for unread message: ${params.message.externalMessageId}`);
  }
  return resolved.candidateId;
}

async function processUnreadMessage(params: {
  userId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  adapter: CandidateCommunicationSkillAdapter;
  repo: CandidateConversationRepository;
  handleMessage: HandleMessage;
  message: UnreadCandidateMessage;
}): Promise<HandleCandidateMessageResult> {
  const candidateId = await resolveCandidateId({
    repo: params.repo,
    userId: params.userId,
    platform: params.platform,
    message: params.message,
  });

  return params.handleMessage({
    userId: params.userId,
    payload: {
      jobDescriptionId: params.jobDescriptionId,
      candidateId,
      platform: params.platform,
      message: {
        content: params.message.content,
        externalMessageId: params.message.externalMessageId,
        receivedAt: params.message.receivedAt,
      },
      executeReply: true,
    },
    dependencies: {
      repo: params.repo,
      createAdapter: () => params.adapter,
      closeAdapterAfterReply: false,
    },
  });
}

export async function runCandidateCommunicationSkill(
  params: RunCandidateCommunicationSkillParams,
): Promise<CandidateCommunicationSkillResult> {
  const repo = params.repo ?? prismaCandidateConversationRepository;
  const handleMessage = params.handleMessage ?? handleCandidateMessage;
  const maxPasses = params.maxPasses ?? bossLikeUnreadCommunicationSkill.maxPasses;
  let processed = 0;
  let failed = 0;

  try {
    await params.adapter.loginIfNeeded();

    for (let pass = 1; pass <= maxPasses; pass += 1) {
      const unreadMessages = await params.adapter.listUnreadMessages();
      if (unreadMessages.length === 0) {
        return {
          status: 'success',
          stoppedReason: 'no_unread_messages',
          processed,
          failed,
          passes: pass,
        };
      }

      for (const message of unreadMessages) {
        await processUnreadMessage({
          userId: params.userId,
          jobDescriptionId: params.jobDescriptionId,
          platform: params.platform,
          adapter: params.adapter,
          repo,
          handleMessage,
          message,
        });
        processed += 1;
      }
    }
  } catch (error) {
    failed += 1;
    throw error;
  } finally {
    await params.adapter.close();
  }

  throw new Error(`unread inbox was not empty after ${maxPasses} passes`);
}
