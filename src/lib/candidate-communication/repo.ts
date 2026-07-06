import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  CandidateCommunicationAction,
  CandidateCommunicationStage,
  CandidateIntentLevel,
  CandidateMessageDeliveryStatus,
  CandidateMessageIntent,
  CandidateMessageRole,
} from './types';

type NullableDate = Date | null;

type JsonRecord = Record<string, unknown>;

export type CandidateCommunicationSubject = {
  jobDescription: {
    id: string;
    userId: string;
    department: string;
    position: string;
    positionDescription: string;
    salaryRange?: string | null;
    workLocations?: unknown | null;
    tone: string;
    status: string;
    content: unknown;
    evaluation: unknown | null;
    generationMeta: unknown | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
  candidate: {
    id: string;
    displayName: string;
    profileUrl: string | null;
    sourcePlatform: string;
  } | null;
  latestResume: {
    id: string;
    rawText: string;
  } | null;
  screeningResult: {
    finalScore: number;
  } | null;
};

export type CandidateConversationDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: string;
  stage: CandidateCommunicationStage;
  status: string;
  intentLevel: CandidateIntentLevel | null;
  messageCount: number;
  lastActiveAt: string;
  lastCandidateMessageAt: string | null;
  lastAgentMessageAt: string | null;
  nextFollowUpAt: string | null;
  outcomeResult: string | null;
  outcomeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateConversationMessageDto = {
  id: string;
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: string;
  role: CandidateMessageRole;
  content: string;
  externalMessageId: string | null;
  deliveryStatus: CandidateMessageDeliveryStatus;
  browserTrace: JsonRecord | null;
  errorMessage: string | null;
  occurredAt: string;
  createdAt: string;
};

export type CandidateConversationDecisionDto = {
  id: string;
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  inputMessageId: string;
  outputMessageId: string | null;
  intent: CandidateMessageIntent;
  intentLevel: CandidateIntentLevel;
  nextStage: CandidateCommunicationStage;
  shouldReply: boolean;
  reply: string | null;
  actions: CandidateCommunicationAction[];
  rationale: string;
  llmMeta: JsonRecord | null;
  createdAt: string;
};

export type CandidateConversationMemoryDto = {
  id: string;
  outcomeResult: string;
};

export type FindOrCreateConversationParams = {
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: string;
  lastActiveAt: Date;
};

export type CreateMessageParams = {
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: string;
  role: CandidateMessageRole;
  content: string;
  externalMessageId?: string | null;
  deliveryStatus: CandidateMessageDeliveryStatus;
  browserTrace?: JsonRecord | null;
  errorMessage?: string | null;
  occurredAt: Date;
};

export type UpdateConversationParams = {
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  stage: CandidateCommunicationStage;
  status: string;
  intentLevel: CandidateIntentLevel;
  messageCount: number;
  lastActiveAt: Date;
  lastCandidateMessageAt?: Date | null;
  lastAgentMessageAt?: Date | null;
  nextFollowUpAt?: Date | null;
  outcomeResult?: string | null;
  outcomeReason?: string | null;
};

export type CreateDecisionParams = {
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  inputMessageId: string;
  outputMessageId?: string | null;
  intent: CandidateMessageIntent;
  intentLevel: CandidateIntentLevel;
  nextStage: CandidateCommunicationStage;
  shouldReply: boolean;
  reply: string | null;
  actions: CandidateCommunicationAction[];
  rationale: string;
  llmMeta?: JsonRecord | null;
};

export type UpdateMessageDeliveryParams = {
  userId: string;
  messageId: string;
  deliveryStatus: CandidateMessageDeliveryStatus;
  browserTrace?: JsonRecord | null;
  errorMessage?: string | null;
};

export type CreateMemoryParams = {
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  outcomeResult: string;
  outcomeReason: string;
  intent: JsonRecord;
  profileSummary: JsonRecord;
  keyPoints: JsonRecord[];
  dropOffReason?: string | null;
  nextFollowUpAt?: Date | null;
};

export type CandidateConversationRepository = {
  getSubject(params: {
    userId: string;
    jobDescriptionId: string;
    candidateId: string;
  }): Promise<CandidateCommunicationSubject>;
  findOrCreateConversation(
    params: FindOrCreateConversationParams,
  ): Promise<CandidateConversationDto>;
  listRecentMessages(params: {
    conversationId: string;
    limit: number;
  }): Promise<CandidateConversationMessageDto[]>;
  createMessage(params: CreateMessageParams): Promise<CandidateConversationMessageDto>;
  updateMessageDelivery(
    params: UpdateMessageDeliveryParams,
  ): Promise<CandidateConversationMessageDto | null>;
  createDecision(params: CreateDecisionParams): Promise<CandidateConversationDecisionDto>;
  updateConversation(params: UpdateConversationParams): Promise<CandidateConversationDto>;
  createMemory(params: CreateMemoryParams): Promise<CandidateConversationMemoryDto>;
  markCandidateReplied(params: {
    userId: string;
    candidateId: string;
    lastActiveAt: Date;
  }): Promise<void>;
  resolveCandidateForPlatformMessage(params: {
    userId: string;
    platform: string;
    platformCandidateId?: string | null;
    profileUrl?: string | null;
    candidateName?: string | null;
  }): Promise<{ candidateId: string } | null>;
  resolveJobDescriptionForCandidateMessage?(params: {
    userId: string;
    candidateId: string;
    fallbackJobDescriptionId?: string | null;
    platformJobTitle?: string | null;
  }): Promise<{ jobDescriptionId: string } | null>;
};

function iso(date: Date): string;
function iso(date: NullableDate): string | null;
function iso(date: NullableDate): string | null {
  return date ? date.toISOString() : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : toJson(value);
}

function toRecordOrNull(value: unknown | null): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function normalizeMatchText(value?: string | null): string {
  return value?.trim().replace(/\s+/g, '').toLowerCase() ?? '';
}

function readContentTitle(content: unknown): string | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const title = (content as { title?: unknown }).title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

function mapConversation(row: {
  id: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: string;
  stage: string;
  status: string;
  intentLevel: string | null;
  messageCount: number;
  lastActiveAt: Date;
  lastCandidateMessageAt: NullableDate;
  lastAgentMessageAt: NullableDate;
  nextFollowUpAt: NullableDate;
  outcomeResult: string | null;
  outcomeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CandidateConversationDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    platform: row.platform,
    stage: row.stage as CandidateCommunicationStage,
    status: row.status,
    intentLevel: row.intentLevel as CandidateIntentLevel | null,
    messageCount: row.messageCount,
    lastActiveAt: iso(row.lastActiveAt),
    lastCandidateMessageAt: iso(row.lastCandidateMessageAt),
    lastAgentMessageAt: iso(row.lastAgentMessageAt),
    nextFollowUpAt: iso(row.nextFollowUpAt),
    outcomeResult: row.outcomeResult,
    outcomeReason: row.outcomeReason,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapMessage(row: {
  id: string;
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  platform: string;
  role: string;
  content: string;
  externalMessageId: string | null;
  deliveryStatus: string;
  browserTrace: unknown | null;
  errorMessage: string | null;
  occurredAt: Date;
  createdAt: Date;
}): CandidateConversationMessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    platform: row.platform,
    role: row.role as CandidateMessageRole,
    content: row.content,
    externalMessageId: row.externalMessageId,
    deliveryStatus: row.deliveryStatus as CandidateMessageDeliveryStatus,
    browserTrace: toRecordOrNull(row.browserTrace),
    errorMessage: row.errorMessage,
    occurredAt: iso(row.occurredAt),
    createdAt: iso(row.createdAt),
  };
}

function mapDecision(row: {
  id: string;
  conversationId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  inputMessageId: string;
  outputMessageId: string | null;
  intent: string;
  intentLevel: string;
  nextStage: string;
  shouldReply: boolean;
  reply: string | null;
  actions: unknown;
  rationale: string;
  llmMeta: unknown | null;
  createdAt: Date;
}): CandidateConversationDecisionDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    inputMessageId: row.inputMessageId,
    outputMessageId: row.outputMessageId,
    intent: row.intent as CandidateMessageIntent,
    intentLevel: row.intentLevel as CandidateIntentLevel,
    nextStage: row.nextStage as CandidateCommunicationStage,
    shouldReply: row.shouldReply,
    reply: row.reply,
    actions: Array.isArray(row.actions) ? (row.actions as CandidateCommunicationAction[]) : [],
    rationale: row.rationale,
    llmMeta: toRecordOrNull(row.llmMeta),
    createdAt: iso(row.createdAt),
  };
}

export const prismaCandidateConversationRepository: CandidateConversationRepository = {
  async getSubject(params) {
    const [jobDescription, candidate, latestResume, screeningResult] = await Promise.all([
      prisma.jobDescription.findFirst({
        where: { id: params.jobDescriptionId, userId: params.userId },
        select: {
          id: true,
          userId: true,
          department: true,
          position: true,
          positionDescription: true,
          tone: true,
          status: true,
          content: true,
          evaluation: true,
          generationMeta: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.candidate.findFirst({
        where: { id: params.candidateId, userId: params.userId },
        select: {
          id: true,
          displayName: true,
          profileUrl: true,
          sourcePlatform: true,
        },
      }),
      prisma.candidateResume.findFirst({
        where: { userId: params.userId, candidateId: params.candidateId },
        orderBy: { fetchedAt: 'desc' },
        select: { id: true, rawText: true },
      }),
      prisma.candidateScreeningResult.findFirst({
        where: {
          userId: params.userId,
          jobDescriptionId: params.jobDescriptionId,
          candidateId: params.candidateId,
        },
        orderBy: { updatedAt: 'desc' },
        select: { finalScore: true },
      }),
    ]);

    return { jobDescription, candidate, latestResume, screeningResult };
  },

  async findOrCreateConversation(params) {
    const existing = await prisma.candidateConversation.findUnique({
      where: {
        userId_jobDescriptionId_candidateId: {
          userId: params.userId,
          jobDescriptionId: params.jobDescriptionId,
          candidateId: params.candidateId,
        },
      },
    });
    if (existing) return mapConversation(existing);

    const row = await prisma.candidateConversation.create({
      data: {
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
        platform: params.platform,
        stage: 'new',
        status: 'active',
        lastActiveAt: params.lastActiveAt,
        lastCandidateMessageAt: params.lastActiveAt,
      },
    });
    return mapConversation(row);
  },

  async listRecentMessages(params) {
    const rows = await prisma.candidateConversationMessage.findMany({
      where: { conversationId: params.conversationId },
      orderBy: { occurredAt: 'desc' },
      take: params.limit,
    });
    return rows.reverse().map(mapMessage);
  },

  async createMessage(params) {
    const row = await prisma.candidateConversationMessage.create({
      data: {
        conversationId: params.conversationId,
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
        platform: params.platform,
        role: params.role,
        content: params.content,
        externalMessageId: params.externalMessageId ?? null,
        deliveryStatus: params.deliveryStatus,
        browserTrace:
          params.browserTrace === undefined ? Prisma.JsonNull : toNullableJson(params.browserTrace),
        errorMessage: params.errorMessage ?? null,
        occurredAt: params.occurredAt,
      },
    });
    return mapMessage(row);
  },

  async updateMessageDelivery(params) {
    const data: Prisma.CandidateConversationMessageUpdateManyMutationInput = {
      deliveryStatus: params.deliveryStatus,
    };
    if (params.browserTrace !== undefined) data.browserTrace = toNullableJson(params.browserTrace);
    if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;

    const result = await prisma.candidateConversationMessage.updateMany({
      where: { id: params.messageId, userId: params.userId },
      data,
    });
    if (result.count === 0) return null;
    const row = await prisma.candidateConversationMessage.findFirst({
      where: { id: params.messageId, userId: params.userId },
    });
    return row ? mapMessage(row) : null;
  },

  async createDecision(params) {
    const row = await prisma.candidateConversationDecision.create({
      data: {
        conversationId: params.conversationId,
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
        inputMessageId: params.inputMessageId,
        outputMessageId: params.outputMessageId ?? null,
        intent: params.intent,
        intentLevel: params.intentLevel,
        nextStage: params.nextStage,
        shouldReply: params.shouldReply,
        reply: params.reply,
        actions: toJson(params.actions),
        rationale: params.rationale,
        llmMeta: params.llmMeta === undefined ? Prisma.JsonNull : toNullableJson(params.llmMeta),
      },
    });
    return mapDecision(row);
  },

  async updateConversation(params) {
    const row = await prisma.candidateConversation.update({
      where: {
        userId_jobDescriptionId_candidateId: {
          userId: params.userId,
          jobDescriptionId: params.jobDescriptionId,
          candidateId: params.candidateId,
        },
      },
      data: {
        stage: params.stage,
        status: params.status,
        intentLevel: params.intentLevel,
        messageCount: params.messageCount,
        lastActiveAt: params.lastActiveAt,
        lastCandidateMessageAt: params.lastCandidateMessageAt,
        lastAgentMessageAt: params.lastAgentMessageAt,
        nextFollowUpAt: params.nextFollowUpAt,
        outcomeResult: params.outcomeResult,
        outcomeReason: params.outcomeReason,
      },
    });
    return mapConversation(row);
  },

  async createMemory(params) {
    const row = await prisma.candidateConversationMemory.create({
      data: {
        conversationId: params.conversationId,
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
        outcomeResult: params.outcomeResult,
        outcomeReason: params.outcomeReason,
        intent: toJson(params.intent),
        profileSummary: toJson(params.profileSummary),
        keyPoints: toJson(params.keyPoints),
        dropOffReason: params.dropOffReason ?? null,
        nextFollowUpAt: params.nextFollowUpAt ?? null,
      },
    });
    return { id: row.id, outcomeResult: row.outcomeResult };
  },

  async markCandidateReplied(params) {
    await prisma.candidate.updateMany({
      where: { id: params.candidateId, userId: params.userId },
      data: { replied: true, lastActiveAt: params.lastActiveAt },
    });
  },

  async resolveCandidateForPlatformMessage(params) {
    const identifiers = [
      ...(params.platformCandidateId ? [{ platformCandidateId: params.platformCandidateId }] : []),
      ...(params.profileUrl ? [{ profileUrl: params.profileUrl }] : []),
    ];
    if (identifiers.length > 0) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          userId: params.userId,
          sourcePlatform: params.platform,
          OR: identifiers,
        },
        select: { id: true },
      });
      if (candidate) return { candidateId: candidate.id };
    }

    const candidateName = normalizeMatchText(params.candidateName);
    if (!candidateName) return null;

    const candidates = await prisma.candidate.findMany({
      where: {
        userId: params.userId,
        sourcePlatform: params.platform,
      },
      select: {
        id: true,
        displayName: true,
        currentCompany: true,
      },
      take: 200,
    });
    const matched = candidates.find(
      (candidate) =>
        normalizeMatchText(candidate.displayName) === candidateName ||
        normalizeMatchText(candidate.currentCompany) === candidateName,
    );

    return matched ? { candidateId: matched.id } : null;
  },

  async resolveJobDescriptionForCandidateMessage(params) {
    const screeningResult = await prisma.candidateScreeningResult.findFirst({
      where: { userId: params.userId, candidateId: params.candidateId },
      orderBy: { updatedAt: 'desc' },
      select: { jobDescriptionId: true },
    });
    if (screeningResult) {
      return { jobDescriptionId: screeningResult.jobDescriptionId };
    }

    const platformJobTitle = normalizeMatchText(params.platformJobTitle);
    if (platformJobTitle) {
      const jobDescriptions = await prisma.jobDescription.findMany({
        where: { userId: params.userId },
        select: {
          id: true,
          position: true,
          content: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      const exactMatch = jobDescriptions.find((jobDescription) => {
        const position = normalizeMatchText(jobDescription.position);
        const contentTitle = normalizeMatchText(readContentTitle(jobDescription.content));
        return position === platformJobTitle || contentTitle === platformJobTitle;
      });
      if (exactMatch) {
        return { jobDescriptionId: exactMatch.id };
      }

      const fuzzyMatch = jobDescriptions.find((jobDescription) => {
        const position = normalizeMatchText(jobDescription.position);
        const contentTitle = normalizeMatchText(readContentTitle(jobDescription.content));
        return (
          (position.length > 0 &&
            (position.includes(platformJobTitle) || platformJobTitle.includes(position))) ||
          (contentTitle.length > 0 &&
            (contentTitle.includes(platformJobTitle) || platformJobTitle.includes(contentTitle)))
        );
      });
      if (fuzzyMatch) {
        return { jobDescriptionId: fuzzyMatch.id };
      }
    }

    if (params.fallbackJobDescriptionId) {
      const fallback = await prisma.jobDescription.findFirst({
        where: { id: params.fallbackJobDescriptionId, userId: params.userId },
        select: { id: true },
      });
      if (fallback) {
        return { jobDescriptionId: fallback.id };
      }
    }

    const latestActive = await prisma.jobDescription.findFirst({
      where: { userId: params.userId, status: { in: ['published', 'ready_to_publish'] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (latestActive) {
      return { jobDescriptionId: latestActive.id };
    }

    const latestAny = await prisma.jobDescription.findFirst({
      where: { userId: params.userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return latestAny ? { jobDescriptionId: latestAny.id } : null;
  },
};
