import type { CandidateSourceAdapter } from '@/lib/candidate-screening/adapters/types';
import type { RawCandidate } from '@/lib/candidate-screening/ingest';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

export type UnreadCandidateReplyTarget = {
  receiverId: string;
  jobId?: string | null;
  sourceMessageId?: string | null;
};

export type UnreadCandidateMessage = {
  externalMessageId: string;
  platformCandidateId?: string | null;
  candidateName?: string | null;
  profileUrl?: string | null;
  platformJobTitle?: string | null;
  replyTarget?: UnreadCandidateReplyTarget | null;
  content: string;
  receivedAt: Date;
};

export type CandidateCommunicationSkill = {
  id: string;
  name: string;
  platform: CandidateScreeningPlatform;
  description: string;
  stopCondition: 'no_unread_messages';
  maxPasses: number;
};

export type CandidateCommunicationSkillAdapter = CandidateSourceAdapter & {
  listUnreadMessages(): Promise<UnreadCandidateMessage[]>;
  collectCandidateFromMessage?(message: UnreadCandidateMessage): Promise<RawCandidate | null>;
  createReplyAdapterForMessage?(message: UnreadCandidateMessage): CandidateSourceAdapter;
  markUnreadMessageProcessed?(message: UnreadCandidateMessage): Promise<void>;
};

export type CandidateCommunicationSkillResult = {
  status: 'success';
  stoppedReason: 'no_unread_messages';
  processed: number;
  failed: number;
  passes: number;
};

export const bossLikeUnreadCommunicationSkill: CandidateCommunicationSkill = {
  id: 'boss-like-unread-communication',
  name: 'process_unread_candidate_messages',
  platform: 'boss-like',
  description:
    'Open boss-like unread messages, process every unread candidate reply, and stop only after no unread messages remain.',
  stopCondition: 'no_unread_messages',
  maxPasses: 10,
};
