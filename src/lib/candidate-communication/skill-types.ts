import type { CandidateSourceAdapter } from '@/lib/candidate-screening/adapters/types';
import type { RawCandidate } from '@/lib/candidate-screening/ingest';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

export type UnreadCandidateReplyTarget = {
  receiverId?: string | null;
  jobId?: string | null;
  sourceMessageId?: string | null;
  browserThreadSelector?: string | null;
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
  targets: {
    threadList: string;
    replyInput: string;
    sendButton: string;
  };
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
  targets: {
    threadList: '[data-conversation-thread], [data-testid="message-thread"]',
    replyInput: 'textarea[placeholder="输入回复..."]',
    sendButton: 'button:has-text("发送")',
  },
};

export const candidateCommunicationSkills: Record<
  CandidateScreeningPlatform,
  CandidateCommunicationSkill
> = {
  boss: {
    id: 'boss-unread-communication',
    name: 'process_unread_candidate_messages',
    platform: 'boss',
    description: 'Process unread candidate conversations in the BOSS enterprise message center.',
    stopCondition: 'no_unread_messages',
    maxPasses: 10,
    targets: {
      threadList: '[data-geek-id], .chat-conversation-item',
      replyInput: '.chat-input textarea, textarea[placeholder*="消息"]',
      sendButton: '.chat-send-button, button:has-text("发送")',
    },
  },
  liepin: {
    id: 'liepin-unread-communication',
    name: 'process_unread_candidate_messages',
    platform: 'liepin',
    description: 'Process unread candidate conversations in the Liepin enterprise message center.',
    stopCondition: 'no_unread_messages',
    maxPasses: 10,
    targets: {
      threadList: '[data-resume-id], .im-conversation-item',
      replyInput: '.im-chat-editor textarea, textarea[placeholder*="沟通"]',
      sendButton: '.im-send-btn, button:has-text("发送消息")',
    },
  },
  zhilian: {
    id: 'zhilian-unread-communication',
    name: 'process_unread_candidate_messages',
    platform: 'zhilian',
    description: 'Process unread candidate conversations in the Zhilian enterprise message center.',
    stopCondition: 'no_unread_messages',
    maxPasses: 10,
    targets: {
      threadList: '[data-resume-id], .message-session-item',
      replyInput: '.message-editor textarea, textarea[placeholder*="消息"]',
      sendButton: '.send-message, button:has-text("发送")',
    },
  },
  'boss-like': bossLikeUnreadCommunicationSkill,
};
