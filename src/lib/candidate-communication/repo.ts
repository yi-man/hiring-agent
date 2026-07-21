import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { updateCandidateInterviewProgressInTransaction } from '@/lib/candidate-screening/repo';
import type { CandidateInterviewStage } from '@/lib/candidate-screening/types';
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

export type CandidateMessageProcessingOutcome =
  | 'in_flight'
  | 'processed_ackable'
  | 'delivery_failed'
  | 'delivery_unknown';

export type CandidateCommunicationSubject = {
  jobDescription: {
    id: string;
    userId: string;
    department: string;
    position: string;
    positionDescription: string;
    salaryRange?: string | null;
    workLocations?: unknown | null;
    hiringTarget?: number | null;
    onboardedCount?: number;
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
    id: string;
    runId: string;
    finalScore: number;
    interviewStage: CandidateInterviewStage;
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
  processingOutcome?: CandidateMessageProcessingOutcome | null;
  processedAt?: string | null;
  isReplay?: boolean;
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
  finalizedAt?: string | null;
};

export type CandidateConversationMemoryDto = {
  id: string;
  outcomeResult: string;
};

export type CandidateCommunicationRunMode = 'batch' | 'single';

export type CandidateCommunicationRunStatus = 'running' | 'success' | 'failed';

export type CandidateCommunicationRunRecord = {
  candidateId: string | null;
  candidateName: string | null;
  status: CandidateCommunicationRunStatus;
  detail: string;
};

export type CandidateCommunicationRunStats = {
  total: number;
  selected: number;
  processed: number;
  failed: number;
  passes?: number;
  records: CandidateCommunicationRunRecord[];
};

export type CandidateCommunicationRunDto = {
  id: string;
  userId: string;
  jobDescriptionId: string | null;
  candidateId: string | null;
  platform: string;
  mode: CandidateCommunicationRunMode;
  status: CandidateCommunicationRunStatus;
  stats: CandidateCommunicationRunStats | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  jobDescription?: {
    id: string;
    department: string;
    position: string;
    status: string;
  } | null;
  candidate?: {
    id: string;
    displayName: string;
  } | null;
};

export type CreateCandidateCommunicationRunParams = {
  userId: string;
  jobDescriptionId?: string | null;
  candidateId?: string | null;
  platform: string;
  mode: CandidateCommunicationRunMode;
  status: CandidateCommunicationRunStatus;
  stats?: CandidateCommunicationRunStats | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type UpdateCandidateCommunicationRunParams = {
  userId: string;
  runId: string;
  status?: CandidateCommunicationRunStatus;
  stats?: CandidateCommunicationRunStats | null;
  errorMessage?: string | null;
  finishedAt?: Date | null;
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

export type CandidateIncomingMessageProcessingResult =
  | {
      status: 'claimed';
      claimId: string;
      decision?: CandidateConversationDecisionDto;
    }
  | {
      status: 'resume_finalization';
      claimId: string;
      decision: CandidateConversationDecisionDto;
      outgoingMessage: CandidateConversationMessageDto | null;
      completionOutcome: Exclude<CandidateMessageProcessingOutcome, 'in_flight'>;
    }
  | {
      status: 'processed';
      outcome: Exclude<CandidateMessageProcessingOutcome, 'in_flight'>;
    }
  | { status: 'in_flight' };

export type ClaimIncomingMessageProcessingParams = {
  userId: string;
  messageId: string;
  now?: Date;
};

export type CompleteIncomingMessageProcessingParams = {
  userId: string;
  messageId: string;
  claimId: string;
  outcome: Exclude<CandidateMessageProcessingOutcome, 'in_flight'>;
  errorMessage?: string | null;
};

export type RenewIncomingMessageProcessingParams = {
  userId: string;
  messageId: string;
  claimId: string;
  now?: Date;
};

export class CandidateExternalMessageIdentityConflictError extends Error {
  constructor(externalMessageId: string) {
    super(`external message id belongs to a different message: ${externalMessageId}`);
    this.name = 'CandidateExternalMessageIdentityConflictError';
  }
}

export const CANDIDATE_INCOMING_PROCESSING_LEASE_MS = 10 * 60 * 1000;
export const CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR =
  '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。';

export function candidateCommunicationActionIdempotencyKey(inputMessageId: string): string {
  return `candidate-communication:${inputMessageId}`;
}

export function candidateCommunicationReplyExternalMessageId(inputMessageId: string): string {
  return `candidate-communication-reply:${inputMessageId}`;
}

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

export type UpdateDecisionOutputParams = {
  userId: string;
  inputMessageId: string;
  outputMessageId: string | null;
};

export type FinalizeCandidateDecisionParams = {
  userId: string;
  messageId: string;
  claimId: string;
  inputMessageId: string;
  interviewStage: 'replied' | 'withdrawn';
  conversation: Omit<UpdateConversationParams, 'messageCount'> & {
    messageCountIncrement: number;
  };
  memory?: CreateMemoryParams | null;
  now?: Date;
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
  claimIncomingMessageProcessing(
    params: ClaimIncomingMessageProcessingParams,
  ): Promise<CandidateIncomingMessageProcessingResult>;
  completeIncomingMessageProcessing(
    params: CompleteIncomingMessageProcessingParams,
  ): Promise<boolean>;
  renewIncomingMessageProcessing(params: RenewIncomingMessageProcessingParams): Promise<boolean>;
  updateMessageDelivery(
    params: UpdateMessageDeliveryParams,
  ): Promise<CandidateConversationMessageDto | null>;
  createDecision(params: CreateDecisionParams): Promise<CandidateConversationDecisionDto>;
  updateDecisionOutput(
    params: UpdateDecisionOutputParams,
  ): Promise<CandidateConversationDecisionDto | null>;
  finalizeCandidateDecision(
    params: FinalizeCandidateDecisionParams,
  ): Promise<CandidateConversationDto | null>;
  updateConversation(params: UpdateConversationParams): Promise<CandidateConversationDto>;
  createMemory(params: CreateMemoryParams): Promise<CandidateConversationMemoryDto>;
  markCandidateReplied(params: {
    userId: string;
    candidateId: string;
    lastActiveAt: Date;
  }): Promise<void>;
  syncCandidateInterviewStage(params: {
    userId: string;
    jobDescriptionId: string;
    candidateId: string;
    interviewStage: 'replied' | 'withdrawn';
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

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toRecordOrNull(value: unknown | null): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function toCommunicationRunStats(value: unknown | null): CandidateCommunicationRunStats | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stats = value as Partial<CandidateCommunicationRunStats>;
  const records = Array.isArray(stats.records)
    ? stats.records
        .map((record): CandidateCommunicationRunRecord | null => {
          if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
          const item = record as Partial<CandidateCommunicationRunRecord>;
          if (item.status !== 'running' && item.status !== 'success' && item.status !== 'failed') {
            return null;
          }
          return {
            candidateId: typeof item.candidateId === 'string' ? item.candidateId : null,
            candidateName: typeof item.candidateName === 'string' ? item.candidateName : null,
            status: item.status,
            detail: typeof item.detail === 'string' ? item.detail : '',
          };
        })
        .filter((record): record is CandidateCommunicationRunRecord => Boolean(record))
    : [];

  return {
    total: typeof stats.total === 'number' ? stats.total : 0,
    selected: typeof stats.selected === 'number' ? stats.selected : 0,
    processed: typeof stats.processed === 'number' ? stats.processed : 0,
    failed: typeof stats.failed === 'number' ? stats.failed : 0,
    ...(typeof stats.passes === 'number' ? { passes: stats.passes } : {}),
    records,
  };
}

function normalizeMatchText(value?: string | null): string {
  return value?.trim().replace(/\s+/g, '').toLowerCase() ?? '';
}

function readContentTitle(content: unknown): string | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const title = (content as { title?: unknown }).title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

async function listCandidateJobDescriptionRelationIds(params: {
  userId: string;
  candidateId: string;
  jobDescriptionIds?: readonly string[];
}): Promise<Set<string>> {
  if (params.jobDescriptionIds?.length === 0) return new Set();
  const jobDescriptionScope = params.jobDescriptionIds
    ? { jobDescriptionId: { in: [...params.jobDescriptionIds] } }
    : {};
  const [screeningResults, conversations] = await Promise.all([
    prisma.candidateScreeningResult.findMany({
      where: {
        userId: params.userId,
        candidateId: params.candidateId,
        ...jobDescriptionScope,
      },
      select: { jobDescriptionId: true },
    }),
    prisma.candidateConversation.findMany({
      where: {
        userId: params.userId,
        candidateId: params.candidateId,
        ...jobDescriptionScope,
      },
      select: { jobDescriptionId: true },
    }),
  ]);

  return new Set([
    ...screeningResults.map(({ jobDescriptionId }) => jobDescriptionId),
    ...conversations.map(({ jobDescriptionId }) => jobDescriptionId),
  ]);
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
  processingOutcome?: string | null;
  processedAt?: Date | null;
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
    processingOutcome:
      (row.processingOutcome as CandidateMessageProcessingOutcome | null | undefined) ?? null,
    processedAt: row.processedAt ? iso(row.processedAt) : null,
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
  finalizedAt?: Date | null;
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
    finalizedAt: row.finalizedAt ? iso(row.finalizedAt) : null,
  };
}

function mapCommunicationRun(row: {
  id: string;
  userId: string;
  jobDescriptionId: string | null;
  candidateId: string | null;
  platform: string;
  mode: string;
  status: string;
  stats: unknown | null;
  errorMessage: string | null;
  startedAt: NullableDate;
  finishedAt: NullableDate;
  createdAt: Date;
  updatedAt: Date;
  jobDescription?: {
    id: string;
    department: string;
    position: string;
    status: string;
  } | null;
  candidate?: {
    id: string;
    displayName: string;
  } | null;
}): CandidateCommunicationRunDto {
  return {
    id: row.id,
    userId: row.userId,
    jobDescriptionId: row.jobDescriptionId,
    candidateId: row.candidateId,
    platform: row.platform,
    mode: row.mode === 'single' ? 'single' : 'batch',
    status: row.status === 'failed' ? 'failed' : row.status === 'success' ? 'success' : 'running',
    stats: toCommunicationRunStats(row.stats),
    errorMessage: row.errorMessage,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    jobDescription: row.jobDescription ?? null,
    candidate: row.candidate ?? null,
  };
}

export async function createCandidateCommunicationRun(
  params: CreateCandidateCommunicationRunParams,
): Promise<CandidateCommunicationRunDto> {
  const row = await prisma.candidateCommunicationRun.create({
    data: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId ?? null,
      candidateId: params.candidateId ?? null,
      platform: params.platform,
      mode: params.mode,
      status: params.status,
      stats: params.stats === undefined ? Prisma.JsonNull : toNullableJson(params.stats),
      errorMessage: params.errorMessage ?? null,
      startedAt: params.startedAt ?? null,
      finishedAt: params.finishedAt ?? null,
    },
  });
  return mapCommunicationRun(row);
}

export async function updateCandidateCommunicationRun(
  params: UpdateCandidateCommunicationRunParams,
): Promise<CandidateCommunicationRunDto | null> {
  const data: Prisma.CandidateCommunicationRunUpdateManyMutationInput = {};
  if (params.status !== undefined) data.status = params.status;
  if (params.stats !== undefined) data.stats = toNullableJson(params.stats);
  if (params.errorMessage !== undefined) data.errorMessage = params.errorMessage;
  if (params.finishedAt !== undefined) data.finishedAt = params.finishedAt;

  const result = await prisma.candidateCommunicationRun.updateMany({
    where: { id: params.runId, userId: params.userId },
    data,
  });
  if (result.count === 0) return null;
  return getCandidateCommunicationRun({ userId: params.userId, runId: params.runId });
}

export async function getCandidateCommunicationRun(params: {
  userId: string;
  runId: string;
}): Promise<CandidateCommunicationRunDto | null> {
  const row = await prisma.candidateCommunicationRun.findFirst({
    where: { id: params.runId, userId: params.userId },
    include: {
      jobDescription: {
        select: {
          id: true,
          department: true,
          position: true,
          status: true,
        },
      },
      candidate: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });
  return row ? mapCommunicationRun(row) : null;
}

type LockedCandidateIncomingMessage = {
  id: string;
  conversationId: string;
  platform: string;
  role: string;
  processingClaimId: string | null;
  processingLeaseExpiresAt: Date | null;
  processingOutcome: string | null;
  processedAt: Date | null;
  occurredAt: Date;
  createdAt: Date;
};

type CandidateMessageProcessingCheckpoints = {
  decision: CandidateConversationDecisionDto | null;
  action: { id: string; status: string; errorMessage: string | null } | null;
  outgoing: CandidateConversationMessageDto | null;
  decisionOutputMissing: boolean;
};

async function getCandidateMessageProcessingCheckpoints(
  tx: Prisma.TransactionClient,
  message: LockedCandidateIncomingMessage,
  userId: string,
): Promise<CandidateMessageProcessingCheckpoints> {
  const decisionRow = await tx.candidateConversationDecision.findFirst({
    where: { userId, inputMessageId: message.id },
  });
  const decision = decisionRow ? mapDecision(decisionRow) : null;

  const action = await tx.candidateActionLog.findUnique({
    where: {
      userId_idempotencyKey: {
        userId,
        idempotencyKey: candidateCommunicationActionIdempotencyKey(message.id),
      },
    },
    select: { id: true, status: true, errorMessage: true },
  });

  const outgoingRow = decision?.outputMessageId
    ? await tx.candidateConversationMessage.findFirst({
        where: {
          id: decision.outputMessageId,
          userId,
          conversationId: message.conversationId,
          role: 'agent',
        },
      })
    : await tx.candidateConversationMessage.findUnique({
        where: {
          userId_platform_externalMessageId: {
            userId,
            platform: message.platform,
            externalMessageId: candidateCommunicationReplyExternalMessageId(message.id),
          },
        },
      });
  const decisionOutputMissing = Boolean(decision?.outputMessageId && !outgoingRow);

  return {
    decision,
    action,
    outgoing: outgoingRow ? mapMessage(outgoingRow) : null,
    decisionOutputMissing,
  };
}

async function syncCandidateInterviewStageInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    jobDescriptionId: string;
    candidateId: string;
    interviewStage: 'replied' | 'withdrawn';
    allowReopenWithdrawn?: boolean;
    ownsCandidateCommunicationClaim?: boolean;
  },
): Promise<void> {
  const eligibleStages =
    params.interviewStage === 'replied'
      ? [
          'sourced',
          'screened',
          'to_contact',
          'collected',
          'contacted',
          ...(params.allowReopenWithdrawn ? ['withdrawn'] : []),
        ]
      : [
          'sourced',
          'screened',
          'to_contact',
          'collected',
          'contacted',
          'replied',
          'phone_screen',
          'interviewing',
          'interview_completed',
          'offer',
        ];

  if (params.interviewStage === 'withdrawn') {
    const screeningResult = await tx.candidateScreeningResult.findFirst({
      where: {
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
        interviewStage: { in: eligibleStages },
      },
      select: { interviewStage: true },
    });
    if (!screeningResult) return;

    await updateCandidateInterviewProgressInTransaction(tx, {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: params.candidateId,
      expectedInterviewStage: screeningResult.interviewStage as CandidateInterviewStage,
      interviewStage: 'withdrawn',
      ownsCandidateCommunicationClaim: params.ownsCandidateCommunicationClaim,
    });
    return;
  }

  await tx.candidateScreeningResult.updateMany({
    where: {
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: params.candidateId,
      interviewStage: { in: eligibleStages },
    },
    data: { interviewStage: params.interviewStage },
  });
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
          salaryRange: true,
          workLocations: true,
          hiringTarget: true,
          tone: true,
          status: true,
          content: true,
          evaluation: true,
          generationMeta: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              candidateScreeningResults: { where: { interviewStage: 'onboarded' } },
            },
          },
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
        select: { id: true, runId: true, finalScore: true, interviewStage: true },
      }),
    ]);

    return {
      jobDescription: jobDescription
        ? {
            ...jobDescription,
            onboardedCount: jobDescription._count.candidateScreeningResults,
          }
        : null,
      candidate,
      latestResume,
      screeningResult: screeningResult
        ? {
            ...screeningResult,
            interviewStage: screeningResult.interviewStage as CandidateInterviewStage,
          }
        : null,
    };
  },

  async findOrCreateConversation(params) {
    const where = {
      userId_jobDescriptionId_candidateId: {
        userId: params.userId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: params.candidateId,
      },
    };
    try {
      const row = await prisma.candidateConversation.upsert({
        where,
        create: {
          userId: params.userId,
          jobDescriptionId: params.jobDescriptionId,
          candidateId: params.candidateId,
          platform: params.platform,
          stage: 'new',
          status: 'active',
          lastActiveAt: params.lastActiveAt,
          lastCandidateMessageAt: params.lastActiveAt,
        },
        update: {},
      });
      return mapConversation(row);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const canonical = await prisma.candidateConversation.findUnique({ where });
      if (!canonical) throw error;
      return mapConversation(canonical);
    }
  },

  async listRecentMessages(params) {
    const rows = await prisma.candidateConversationMessage.findMany({
      where: { conversationId: params.conversationId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit,
    });
    return rows.reverse().map(mapMessage);
  },

  async createMessage(params) {
    const data = {
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
    };
    if (params.externalMessageId === undefined || params.externalMessageId === null) {
      const row = await prisma.candidateConversationMessage.create({ data });
      return { ...mapMessage(row), isReplay: false };
    }

    try {
      const row = await prisma.candidateConversationMessage.create({ data });
      return { ...mapMessage(row), isReplay: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const row = await prisma.candidateConversationMessage.findUnique({
        where: {
          userId_platform_externalMessageId: {
            userId: params.userId,
            platform: params.platform,
            externalMessageId: params.externalMessageId,
          },
        },
      });
      if (!row) throw error;
      if (
        row.conversationId !== params.conversationId ||
        row.jobDescriptionId !== params.jobDescriptionId ||
        row.candidateId !== params.candidateId ||
        row.role !== params.role ||
        row.content !== params.content
      ) {
        throw new CandidateExternalMessageIdentityConflictError(params.externalMessageId);
      }
      return { ...mapMessage(row), isReplay: true };
    }
  },

  async claimIncomingMessageProcessing(params) {
    const now = params.now ?? new Date();
    const claimId = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + CANDIDATE_INCOMING_PROCESSING_LEASE_MS);

    return prisma.$transaction(async (tx) => {
      const [message] = await tx.$queryRaw<LockedCandidateIncomingMessage[]>(Prisma.sql`
        SELECT
          id,
          conversation_id AS "conversationId",
          platform,
          role,
          processing_claim_id AS "processingClaimId",
          processing_lease_expires_at AS "processingLeaseExpiresAt",
          processing_outcome AS "processingOutcome",
          processed_at AS "processedAt",
          occurred_at AS "occurredAt",
          created_at AS "createdAt"
        FROM public.candidate_conversation_messages
        WHERE id = ${params.messageId}
          AND user_id = ${params.userId}
        FOR UPDATE
      `);
      if (!message || message.role !== 'candidate') return { status: 'in_flight' as const };
      if (message.processedAt) {
        const outcome =
          message.processingOutcome === 'processed_ackable' ||
          message.processingOutcome === 'delivery_failed' ||
          message.processingOutcome === 'delivery_unknown'
            ? message.processingOutcome
            : 'delivery_unknown';
        return { status: 'processed' as const, outcome };
      }
      if (
        message.processingOutcome === 'in_flight' &&
        message.processingClaimId &&
        message.processingLeaseExpiresAt &&
        message.processingLeaseExpiresAt.getTime() > now.getTime()
      ) {
        return { status: 'in_flight' as const };
      }

      const checkpoints = await getCandidateMessageProcessingCheckpoints(
        tx,
        message,
        params.userId,
      );
      const markProcessed = async (
        outcome: Exclude<CandidateMessageProcessingOutcome, 'in_flight'>,
        errorMessage: string | null = null,
      ) => {
        await tx.candidateConversationMessage.updateMany({
          where: { id: message.id, userId: params.userId },
          data: {
            processingClaimId: null,
            processingLeaseExpiresAt: null,
            processingOutcome: outcome,
            processedAt: now,
            errorMessage,
          },
        });
      };
      const claimProcessing = async () =>
        tx.candidateConversationMessage.updateMany({
          where: { id: message.id, userId: params.userId },
          data: {
            processingClaimId: claimId,
            processingLeaseExpiresAt: leaseExpiresAt,
            processingOutcome: 'in_flight',
            processedAt: null,
            errorMessage: null,
          },
        });

      if (checkpoints.decision) {
        const actionStatus = checkpoints.action?.status ?? null;
        const outgoingStatus = checkpoints.outgoing?.deliveryStatus ?? null;
        const deliveryUnknownEvidence =
          checkpoints.decisionOutputMissing ||
          checkpoints.action?.errorMessage === CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR ||
          checkpoints.outgoing?.errorMessage === CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR;
        const deliveryFailed = actionStatus === 'failed' || outgoingStatus === 'failed';
        const deliverySucceeded = actionStatus === 'success' || outgoingStatus === 'sent';
        const deliveryAmbiguous =
          checkpoints.decisionOutputMissing ||
          actionStatus === 'planned' ||
          actionStatus === 'running' ||
          outgoingStatus === 'planned';

        if (checkpoints.decision.finalizedAt) {
          if (deliveryAmbiguous) {
            if (checkpoints.action) {
              await tx.candidateActionLog.updateMany({
                where: {
                  id: checkpoints.action.id,
                  userId: params.userId,
                  status: { in: ['planned', 'running'] },
                },
                data: {
                  status: 'failed',
                  errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
                },
              });
            }
            if (checkpoints.outgoing?.deliveryStatus === 'planned') {
              await tx.candidateConversationMessage.updateMany({
                where: {
                  id: checkpoints.outgoing.id,
                  userId: params.userId,
                  deliveryStatus: 'planned',
                },
                data: {
                  deliveryStatus: 'failed',
                  errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
                },
              });
            }
          }
          const outcome =
            deliveryUnknownEvidence || deliveryAmbiguous
              ? 'delivery_unknown'
              : deliveryFailed
                ? 'delivery_failed'
                : 'processed_ackable';
          await markProcessed(
            outcome,
            outcome === 'delivery_unknown'
              ? CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR
              : deliveryFailed
                ? (checkpoints.outgoing?.errorMessage ?? null)
                : null,
          );
          return { status: 'processed' as const, outcome };
        }

        const canSafelyResumeSend = Boolean(
          checkpoints.decision.shouldReply &&
          checkpoints.decision.reply &&
          !checkpoints.decision.outputMessageId &&
          !checkpoints.outgoing &&
          (!checkpoints.action || checkpoints.action.status === 'planned'),
        );
        if (canSafelyResumeSend) {
          const claimed = await claimProcessing();
          return claimed.count === 1
            ? {
                status: 'claimed' as const,
                claimId,
                decision: checkpoints.decision,
              }
            : { status: 'in_flight' as const };
        }

        if (deliverySucceeded) {
          if (checkpoints.action?.status === 'running') {
            await tx.candidateActionLog.updateMany({
              where: {
                id: checkpoints.action.id,
                userId: params.userId,
                status: 'running',
              },
              data: { status: 'success', errorMessage: null },
            });
          }
          if (checkpoints.outgoing?.deliveryStatus === 'planned') {
            await tx.candidateConversationMessage.updateMany({
              where: {
                id: checkpoints.outgoing.id,
                userId: params.userId,
                deliveryStatus: 'planned',
              },
              data: { deliveryStatus: 'sent', errorMessage: null },
            });
            checkpoints.outgoing = {
              ...checkpoints.outgoing,
              deliveryStatus: 'sent',
              errorMessage: null,
            };
          }
        } else if (deliveryFailed) {
          if (
            checkpoints.action &&
            (checkpoints.action.status === 'planned' || checkpoints.action.status === 'running')
          ) {
            await tx.candidateActionLog.updateMany({
              where: {
                id: checkpoints.action.id,
                userId: params.userId,
                status: { in: ['planned', 'running'] },
              },
              data: { status: 'failed' },
            });
          }
          if (checkpoints.outgoing?.deliveryStatus === 'planned') {
            await tx.candidateConversationMessage.updateMany({
              where: {
                id: checkpoints.outgoing.id,
                userId: params.userId,
                deliveryStatus: 'planned',
              },
              data: { deliveryStatus: 'failed' },
            });
            checkpoints.outgoing = {
              ...checkpoints.outgoing,
              deliveryStatus: 'failed',
            };
          }
        } else if (deliveryAmbiguous) {
          if (checkpoints.action) {
            await tx.candidateActionLog.updateMany({
              where: {
                id: checkpoints.action.id,
                userId: params.userId,
                status: { in: ['planned', 'running'] },
              },
              data: {
                status: 'failed',
                errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
              },
            });
          }
          if (checkpoints.outgoing?.deliveryStatus === 'planned') {
            await tx.candidateConversationMessage.updateMany({
              where: {
                id: checkpoints.outgoing.id,
                userId: params.userId,
                deliveryStatus: 'planned',
              },
              data: {
                deliveryStatus: 'failed',
                errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
              },
            });
            checkpoints.outgoing = {
              ...checkpoints.outgoing,
              deliveryStatus: 'failed',
              errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
            };
          }
        }

        const claimed = await claimProcessing();
        if (claimed.count !== 1) return { status: 'in_flight' as const };
        return {
          status: 'resume_finalization' as const,
          claimId,
          decision: checkpoints.decision,
          outgoingMessage: checkpoints.outgoing,
          completionOutcome: deliveryUnknownEvidence
            ? ('delivery_unknown' as const)
            : deliveryFailed
              ? ('delivery_failed' as const)
              : deliverySucceeded
                ? ('processed_ackable' as const)
                : deliveryAmbiguous
                  ? ('delivery_unknown' as const)
                  : ('processed_ackable' as const),
        };
      }

      const hasTerminalCheckpoint = Boolean(
        (checkpoints.action &&
          ['success', 'failed', 'skipped'].includes(checkpoints.action.status)) ||
        (checkpoints.outgoing &&
          (checkpoints.outgoing.deliveryStatus === 'sent' ||
            checkpoints.outgoing.deliveryStatus === 'failed')),
      );
      const hasAmbiguousDelivery = Boolean(
        (checkpoints.action &&
          (checkpoints.action.status === 'planned' || checkpoints.action.status === 'running')) ||
        checkpoints.outgoing?.deliveryStatus === 'planned',
      );

      if (hasAmbiguousDelivery && !hasTerminalCheckpoint) {
        if (checkpoints.action) {
          await tx.candidateActionLog.updateMany({
            where: {
              id: checkpoints.action.id,
              userId: params.userId,
              status: { in: ['planned', 'running'] },
            },
            data: {
              status: 'failed',
              errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
            },
          });
        }
        if (checkpoints.outgoing?.deliveryStatus === 'planned') {
          await tx.candidateConversationMessage.updateMany({
            where: {
              id: checkpoints.outgoing.id,
              userId: params.userId,
              deliveryStatus: 'planned',
            },
            data: {
              deliveryStatus: 'failed',
              errorMessage: CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
            },
          });
        }
      }

      if (hasTerminalCheckpoint || hasAmbiguousDelivery) {
        const outcome =
          hasAmbiguousDelivery ||
          checkpoints.action?.errorMessage === CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR ||
          checkpoints.outgoing?.errorMessage === CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR
            ? ('delivery_unknown' as const)
            : checkpoints.action?.status === 'failed' ||
                checkpoints.outgoing?.deliveryStatus === 'failed'
              ? ('delivery_failed' as const)
              : ('delivery_unknown' as const);
        const errorMessage =
          outcome === 'delivery_unknown'
            ? CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR
            : (checkpoints.outgoing?.errorMessage ?? null);
        await markProcessed(outcome, errorMessage);
        return { status: 'processed' as const, outcome };
      }

      const claimed = await claimProcessing();
      return claimed.count === 1
        ? { status: 'claimed' as const, claimId }
        : { status: 'in_flight' as const };
    });
  },

  async completeIncomingMessageProcessing(params) {
    const now = new Date();
    const completed = await prisma.candidateConversationMessage.updateMany({
      where: {
        id: params.messageId,
        userId: params.userId,
        processingClaimId: params.claimId,
        processingLeaseExpiresAt: { gt: now },
        processingOutcome: 'in_flight',
        processedAt: null,
      },
      data: {
        processingClaimId: null,
        processingLeaseExpiresAt: null,
        processingOutcome: params.outcome,
        processedAt: now,
        errorMessage: params.errorMessage ?? null,
      },
    });
    return completed.count === 1;
  },

  async renewIncomingMessageProcessing(params) {
    const now = params.now ?? new Date();
    const renewed = await prisma.candidateConversationMessage.updateMany({
      where: {
        id: params.messageId,
        userId: params.userId,
        processingClaimId: params.claimId,
        processingLeaseExpiresAt: { gt: now },
        processingOutcome: 'in_flight',
        processedAt: null,
      },
      data: {
        processingLeaseExpiresAt: new Date(now.getTime() + CANDIDATE_INCOMING_PROCESSING_LEASE_MS),
      },
    });
    return renewed.count === 1;
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
    const data = {
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
    };
    const row = await prisma.candidateConversationDecision.upsert({
      where: { inputMessageId: params.inputMessageId },
      create: data,
      update: {},
    });
    if (
      row.conversationId !== params.conversationId ||
      row.userId !== params.userId ||
      row.jobDescriptionId !== params.jobDescriptionId ||
      row.candidateId !== params.candidateId
    ) {
      throw new Error(
        `candidate communication decision identity conflict: ${params.inputMessageId}`,
      );
    }
    return mapDecision(row);
  },

  async updateDecisionOutput(params) {
    const updated = await prisma.candidateConversationDecision.updateMany({
      where: {
        userId: params.userId,
        inputMessageId: params.inputMessageId,
        OR: [{ outputMessageId: null }, { outputMessageId: params.outputMessageId }],
      },
      data: { outputMessageId: params.outputMessageId },
    });
    if (updated.count === 0) return null;
    const row = await prisma.candidateConversationDecision.findUnique({
      where: { inputMessageId: params.inputMessageId },
    });
    return row ? mapDecision(row) : null;
  },

  async finalizeCandidateDecision(params) {
    const now = params.now ?? new Date();
    return prisma.$transaction(async (tx) => {
      const [message] = await tx.$queryRaw<
        Array<{
          id: string;
          conversationId: string;
          processingClaimId: string | null;
          processingLeaseExpiresAt: Date | null;
          processingOutcome: string | null;
          processedAt: Date | null;
          occurredAt: Date;
          createdAt: Date;
        }>
      >(Prisma.sql`
        SELECT
          id,
          conversation_id AS "conversationId",
          processing_claim_id AS "processingClaimId",
          processing_lease_expires_at AS "processingLeaseExpiresAt",
          processing_outcome AS "processingOutcome",
          processed_at AS "processedAt",
          occurred_at AS "occurredAt",
          created_at AS "createdAt"
        FROM public.candidate_conversation_messages
        WHERE id = ${params.messageId}
          AND user_id = ${params.userId}
        FOR UPDATE
      `);
      if (
        !message ||
        message.id !== params.inputMessageId ||
        message.processingClaimId !== params.claimId ||
        message.processingOutcome !== 'in_flight' ||
        message.processedAt ||
        !message.processingLeaseExpiresAt ||
        message.processingLeaseExpiresAt.getTime() <= now.getTime()
      ) {
        return null;
      }

      const [decision] = await tx.$queryRaw<Array<{ id: string; finalizedAt: Date | null }>>(
        Prisma.sql`
          SELECT id, finalized_at AS "finalizedAt"
          FROM public.candidate_conversation_decisions
          WHERE input_message_id = ${params.inputMessageId}
            AND user_id = ${params.userId}
          FOR UPDATE
        `,
      );
      if (!decision) return null;

      if (!decision.finalizedAt) {
        const conversation = params.conversation;
        const [currentConversation] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id
          FROM public.candidate_conversations
          WHERE id = ${conversation.conversationId}
            AND user_id = ${conversation.userId}
          FOR UPDATE
        `);
        if (!currentConversation) return null;
        const [chronology] = await tx.$queryRaw<
          Array<{ hasNewerFinalized: boolean; hasOlderRejectedEvidence: boolean }>
        >(Prisma.sql`
            SELECT EXISTS (
              SELECT 1
              FROM public.candidate_conversation_decisions AS newer_decision
              INNER JOIN public.candidate_conversation_messages AS newer_message
                ON newer_message.id = newer_decision.input_message_id
               AND newer_message.user_id = newer_decision.user_id
              INNER JOIN public.candidate_conversation_messages AS current_message
                ON current_message.id = ${message.id}
               AND current_message.user_id = ${params.userId}
              WHERE newer_decision.user_id = ${params.userId}
                AND newer_decision.conversation_id = ${message.conversationId}
                AND newer_decision.finalized_at IS NOT NULL
                AND newer_decision.input_message_id <> ${message.id}
                AND (
                  newer_message.occurred_at,
                  newer_message.created_at,
                  newer_message.id
                ) > (
                  current_message.occurred_at,
                  current_message.created_at,
                  current_message.id
                )
            ) AS "hasNewerFinalized",
            EXISTS (
              SELECT 1
              FROM public.candidate_conversation_decisions AS older_decision
              INNER JOIN public.candidate_conversation_messages AS older_message
                ON older_message.id = older_decision.input_message_id
               AND older_message.user_id = older_decision.user_id
              INNER JOIN public.candidate_conversation_messages AS current_message
                ON current_message.id = ${message.id}
               AND current_message.user_id = ${params.userId}
              WHERE older_decision.user_id = ${params.userId}
                AND older_decision.conversation_id = ${message.conversationId}
                AND older_decision.next_stage = 'rejected'
                AND older_message.occurred_at = current_message.occurred_at
                AND (
                  older_message.occurred_at,
                  older_message.created_at,
                  older_message.id
                ) < (
                  current_message.occurred_at,
                  current_message.created_at,
                  current_message.id
                )
            ) AS "hasOlderRejectedEvidence"
          `);
        const isLatestInput = !chronology?.hasNewerFinalized;
        await tx.candidateConversation.update({
          where: {
            userId_jobDescriptionId_candidateId: {
              userId: conversation.userId,
              jobDescriptionId: conversation.jobDescriptionId,
              candidateId: conversation.candidateId,
            },
          },
          data: {
            messageCount: { increment: conversation.messageCountIncrement },
            ...(isLatestInput
              ? {
                  stage: conversation.stage,
                  status: conversation.status,
                  intentLevel: conversation.intentLevel,
                  lastActiveAt: conversation.lastActiveAt,
                  lastCandidateMessageAt: conversation.lastCandidateMessageAt,
                  lastAgentMessageAt: conversation.lastAgentMessageAt,
                  nextFollowUpAt: conversation.nextFollowUpAt,
                  outcomeResult: conversation.outcomeResult,
                  outcomeReason: conversation.outcomeReason,
                }
              : {}),
          },
        });

        if (isLatestInput) {
          await syncCandidateInterviewStageInTransaction(tx, {
            userId: params.userId,
            jobDescriptionId: conversation.jobDescriptionId,
            candidateId: conversation.candidateId,
            interviewStage: params.interviewStage,
            allowReopenWithdrawn: Boolean(chronology?.hasOlderRejectedEvidence),
            ownsCandidateCommunicationClaim: true,
          });
        }

        if (params.memory) {
          await tx.candidateConversationMemory.create({
            data: {
              conversationId: params.memory.conversationId,
              userId: params.memory.userId,
              jobDescriptionId: params.memory.jobDescriptionId,
              candidateId: params.memory.candidateId,
              outcomeResult: params.memory.outcomeResult,
              outcomeReason: params.memory.outcomeReason,
              intent: toJson(params.memory.intent),
              profileSummary: toJson(params.memory.profileSummary),
              keyPoints: toJson(params.memory.keyPoints),
              dropOffReason: params.memory.dropOffReason ?? null,
              nextFollowUpAt: params.memory.nextFollowUpAt ?? null,
            },
          });
        }

        await tx.candidateConversationDecision.update({
          where: { id: decision.id },
          data: { finalizedAt: now },
        });
      }

      const row = await tx.candidateConversation.findFirst({
        where: {
          id: params.conversation.conversationId,
          userId: params.userId,
        },
      });
      return row ? mapConversation(row) : null;
    });
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

  async syncCandidateInterviewStage(params) {
    await prisma.$transaction((tx) => syncCandidateInterviewStageInTransaction(tx, params));
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
    const matches = candidates.filter(
      (candidate) =>
        normalizeMatchText(candidate.displayName) === candidateName ||
        normalizeMatchText(candidate.currentCompany) === candidateName,
    );

    return matches.length === 1 ? { candidateId: matches[0].id } : null;
  },

  async resolveJobDescriptionForCandidateMessage(params) {
    const platformJobTitle = normalizeMatchText(params.platformJobTitle);
    let fuzzyPlatformTitleMatches: Array<{ id: string }> = [];
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
      const exactMatches = jobDescriptions.filter((jobDescription) => {
        const position = normalizeMatchText(jobDescription.position);
        const contentTitle = normalizeMatchText(readContentTitle(jobDescription.content));
        return position === platformJobTitle || contentTitle === platformJobTitle;
      });
      if (exactMatches.length === 1) {
        return { jobDescriptionId: exactMatches[0].id };
      }
      if (exactMatches.length > 1) {
        const exactMatchIds = exactMatches.map(({ id }) => id);
        const exactMatchIdSet = new Set(exactMatchIds);
        const relatedJobDescriptionIds = await listCandidateJobDescriptionRelationIds({
          userId: params.userId,
          candidateId: params.candidateId,
          jobDescriptionIds: exactMatchIds,
        });
        const fallbackJobDescriptionId =
          params.fallbackJobDescriptionId && exactMatchIdSet.has(params.fallbackJobDescriptionId)
            ? params.fallbackJobDescriptionId
            : null;

        if (
          fallbackJobDescriptionId &&
          (relatedJobDescriptionIds.size === 0 ||
            relatedJobDescriptionIds.has(fallbackJobDescriptionId))
        ) {
          return { jobDescriptionId: fallbackJobDescriptionId };
        }
        if (relatedJobDescriptionIds.size === 1) {
          return { jobDescriptionId: [...relatedJobDescriptionIds][0] };
        }
        return null;
      }

      fuzzyPlatformTitleMatches = jobDescriptions.filter((jobDescription) => {
        const position = normalizeMatchText(jobDescription.position);
        const contentTitle = normalizeMatchText(readContentTitle(jobDescription.content));
        return (
          (position.length > 0 &&
            (position.includes(platformJobTitle) || platformJobTitle.includes(position))) ||
          (contentTitle.length > 0 &&
            (contentTitle.includes(platformJobTitle) || platformJobTitle.includes(contentTitle)))
        );
      });
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

    if (fuzzyPlatformTitleMatches.length === 1) {
      return { jobDescriptionId: fuzzyPlatformTitleMatches[0].id };
    }
    if (fuzzyPlatformTitleMatches.length > 1) {
      const relatedJobDescriptionIds = await listCandidateJobDescriptionRelationIds({
        userId: params.userId,
        candidateId: params.candidateId,
        jobDescriptionIds: fuzzyPlatformTitleMatches.map(({ id }) => id),
      });
      if (relatedJobDescriptionIds.size === 1) {
        return { jobDescriptionId: [...relatedJobDescriptionIds][0] };
      }
      return null;
    }

    const relatedJobDescriptionIds = await listCandidateJobDescriptionRelationIds({
      userId: params.userId,
      candidateId: params.candidateId,
    });
    if (relatedJobDescriptionIds.size === 1) {
      return { jobDescriptionId: [...relatedJobDescriptionIds][0] };
    }
    if (relatedJobDescriptionIds.size > 1) {
      return null;
    }

    const activeJobDescriptions = await prisma.jobDescription.findMany({
      where: { userId: params.userId, status: { in: ['published', 'ready_to_publish'] } },
      select: { id: true },
      take: 2,
    });
    if (activeJobDescriptions.length === 1) {
      return { jobDescriptionId: activeJobDescriptions[0].id };
    }
    if (activeJobDescriptions.length > 1) {
      return null;
    }

    const jobDescriptions = await prisma.jobDescription.findMany({
      where: { userId: params.userId },
      select: { id: true },
      take: 2,
    });
    return jobDescriptions.length === 1 ? { jobDescriptionId: jobDescriptions[0].id } : null;
  },
};
