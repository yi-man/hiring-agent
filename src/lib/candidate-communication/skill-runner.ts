import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';
import { ingestRawCandidate } from '@/lib/candidate-screening/ingest';
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
type IngestCandidate = typeof ingestRawCandidate;

export type RunCandidateCommunicationSkillParams = {
  userId: string;
  jobDescriptionId?: string;
  platform: CandidateScreeningPlatform;
  adapter: CandidateCommunicationSkillAdapter;
  repo?: CandidateConversationRepository;
  handleMessage?: HandleMessage;
  ingestCandidate?: IngestCandidate;
  maxPasses?: number;
};

async function resolveCandidateId(params: {
  repo: CandidateConversationRepository;
  adapter: CandidateCommunicationSkillAdapter;
  ingestCandidate: IngestCandidate;
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
    const rawCandidate = await params.adapter.collectCandidateFromMessage?.(params.message);
    if (!rawCandidate) {
      throw new Error(
        `candidate not found for unread message: ${params.message.externalMessageId}`,
      );
    }
    const stored = await params.ingestCandidate({
      userId: params.userId,
      sourcePlatform: params.platform,
      rawCandidate,
    });
    return stored.candidateId;
  }
  return resolved.candidateId;
}

async function resolveJobDescriptionId(params: {
  repo: CandidateConversationRepository;
  userId: string;
  candidateId: string;
  fallbackJobDescriptionId?: string | null;
  platformJobTitle?: string | null;
  message: UnreadCandidateMessage;
}): Promise<string> {
  const resolved = await params.repo.resolveJobDescriptionForCandidateMessage?.({
    userId: params.userId,
    candidateId: params.candidateId,
    fallbackJobDescriptionId: params.fallbackJobDescriptionId,
    platformJobTitle: params.platformJobTitle,
  });
  const jobDescriptionId = resolved?.jobDescriptionId ?? params.fallbackJobDescriptionId;
  if (!jobDescriptionId) {
    throw new Error(
      `job description not found for unread message: ${params.message.externalMessageId}`,
    );
  }
  return jobDescriptionId;
}

async function processUnreadMessage(params: {
  userId: string;
  jobDescriptionId?: string;
  platform: CandidateScreeningPlatform;
  adapter: CandidateCommunicationSkillAdapter;
  repo: CandidateConversationRepository;
  handleMessage: HandleMessage;
  ingestCandidate: IngestCandidate;
  message: UnreadCandidateMessage;
}): Promise<HandleCandidateMessageResult> {
  const candidateId = await resolveCandidateId({
    repo: params.repo,
    adapter: params.adapter,
    ingestCandidate: params.ingestCandidate,
    userId: params.userId,
    platform: params.platform,
    message: params.message,
  });
  const jobDescriptionId = await resolveJobDescriptionId({
    repo: params.repo,
    userId: params.userId,
    candidateId,
    fallbackJobDescriptionId: params.jobDescriptionId,
    platformJobTitle: params.message.platformJobTitle,
    message: params.message,
  });
  const replyAdapter =
    params.adapter.createReplyAdapterForMessage?.(params.message) ?? params.adapter;

  const result = await params.handleMessage({
    userId: params.userId,
    payload: {
      jobDescriptionId,
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
      createAdapter: () => replyAdapter,
      closeAdapterAfterReply: false,
    },
  });

  if (result.outgoingMessage?.deliveryStatus !== 'failed') {
    await params.adapter.markUnreadMessageProcessed?.(params.message);
  }

  return result;
}

export async function runCandidateCommunicationSkill(
  params: RunCandidateCommunicationSkillParams,
): Promise<CandidateCommunicationSkillResult> {
  const repo = params.repo ?? prismaCandidateConversationRepository;
  const handleMessage = params.handleMessage ?? handleCandidateMessage;
  const ingestCandidate = params.ingestCandidate ?? ingestRawCandidate;
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
          ingestCandidate,
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
