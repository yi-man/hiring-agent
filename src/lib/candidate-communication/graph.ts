import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { addHours } from 'date-fns';
import { createCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/factory';
import type { CandidateSourceAdapter } from '@/lib/candidate-screening/adapters/types';
import {
  isCandidateOutreachAllowedJobStatus,
  isTerminalCandidateInterviewStage,
} from '@/lib/candidate-screening/constants';
import { evaluateCandidateForJd } from '@/lib/candidate-screening/evaluation';
import { buildScreeningPlanFromJd } from '@/lib/candidate-screening/planner';
import {
  claimCandidateActionLog,
  claimJobDescriptionForCandidateOutreach,
  createCandidateActionLog,
  updateCandidateActionLog,
} from '@/lib/candidate-screening/repo';
import type { CandidateActionPlan } from '@/lib/candidate-screening/types';
import { JD_STATUSES, type JD, type JDStatus, type JDTone, type JobDescriptionDto } from '@/types';
import { decideCandidateCommunication, type RunCandidateCommunicationLLM } from './decision';
import { runCandidateCommunicationLLM } from './llm';
import {
  candidateCommunicationActionIdempotencyKey,
  candidateCommunicationReplyExternalMessageId,
  CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR,
  prismaCandidateConversationRepository,
  type CandidateCommunicationSubject,
  type CandidateConversationDto,
  type CandidateConversationMessageDto,
  type CandidateConversationRepository,
  type CandidateMessageProcessingOutcome,
} from './repo';
import type { CandidateMessagePayload } from './api';
import type {
  CandidateCommunicationDecision,
  CandidateCommunicationStage,
  CandidateIntentLevel,
} from './types';

type CreateAdapter = typeof createCandidateSourceAdapter;
type EvaluateCandidate = typeof evaluateCandidateForJd;
type BuildScreeningPlan = typeof buildScreeningPlanFromJd;

export type CandidateCommunicationGraphResult = {
  conversation: CandidateConversationDto;
  incomingMessage: CandidateConversationMessageDto;
  outgoingMessage: CandidateConversationMessageDto | null;
  decision: CandidateCommunicationDecision;
  processingStatus: 'processed' | 'in_flight';
  processingOutcome: CandidateMessageProcessingOutcome;
  ackable: boolean;
};

export type CandidateCommunicationGraphDependencyOverrides = {
  repo?: CandidateConversationRepository;
  createAdapter?: CreateAdapter;
  runLLM?: RunCandidateCommunicationLLM;
  strictLlm?: boolean;
  closeAdapterAfterReply?: boolean;
  evaluateCandidate?: EvaluateCandidate;
  buildPlan?: BuildScreeningPlan;
  strictResumeEvaluation?: boolean;
  createActionLog?: typeof createCandidateActionLog;
  claimActionLog?: typeof claimCandidateActionLog;
  claimJobDescriptionOutreach?: typeof claimJobDescriptionForCandidateOutreach;
  updateActionLog?: typeof updateCandidateActionLog;
};

type CandidateCommunicationGraphDependencies =
  Required<CandidateCommunicationGraphDependencyOverrides>;

type LoadedSubject = {
  jobDescription: NonNullable<CandidateCommunicationSubject['jobDescription']>;
  candidate: NonNullable<CandidateCommunicationSubject['candidate']>;
  latestResume: CandidateCommunicationSubject['latestResume'];
  screeningResult: CandidateCommunicationSubject['screeningResult'];
};

type ResumeEvaluationSource = 'screening_result' | 'latest_resume_evaluation' | 'none';

const CandidateCommunicationGraphState = Annotation.Root({
  userId: Annotation<string>(),
  payload: Annotation<CandidateMessagePayload>(),
  subject: Annotation<LoadedSubject | undefined>(),
  conversation: Annotation<CandidateConversationDto | undefined>(),
  incomingMessage: Annotation<CandidateConversationMessageDto | undefined>(),
  processingClaimId: Annotation<string | null>(),
  processingStatus: Annotation<
    'claimed' | 'resume_finalization' | 'processed' | 'in_flight' | undefined
  >(),
  completionOutcome: Annotation<
    Exclude<CandidateMessageProcessingOutcome, 'in_flight'> | undefined
  >(),
  history: Annotation<CandidateConversationMessageDto[]>(),
  candidateMatchScore: Annotation<number | null>(),
  resumeEvaluationSource: Annotation<ResumeEvaluationSource>(),
  decision: Annotation<CandidateCommunicationDecision | undefined>(),
  outgoingMessage: Annotation<CandidateConversationMessageDto | null | undefined>(),
  updatedConversation: Annotation<CandidateConversationDto | undefined>(),
});

type CandidateCommunicationGraphState = typeof CandidateCommunicationGraphState.State;
type CandidateCommunicationGraphUpdate = typeof CandidateCommunicationGraphState.Update;

function withDefaultDependencies(
  dependencies: CandidateCommunicationGraphDependencyOverrides = {},
): CandidateCommunicationGraphDependencies {
  const strictLlm = dependencies.strictLlm ?? true;
  return {
    repo: dependencies.repo ?? prismaCandidateConversationRepository,
    createAdapter: dependencies.createAdapter ?? createCandidateSourceAdapter,
    runLLM: dependencies.runLLM ?? runCandidateCommunicationLLM,
    strictLlm,
    closeAdapterAfterReply: dependencies.closeAdapterAfterReply ?? true,
    evaluateCandidate: dependencies.evaluateCandidate ?? evaluateCandidateForJd,
    buildPlan: dependencies.buildPlan ?? buildScreeningPlanFromJd,
    strictResumeEvaluation: dependencies.strictResumeEvaluation ?? false,
    createActionLog: dependencies.createActionLog ?? createCandidateActionLog,
    claimActionLog: dependencies.claimActionLog ?? claimCandidateActionLog,
    claimJobDescriptionOutreach:
      dependencies.claimJobDescriptionOutreach ?? claimJobDescriptionForCandidateOutreach,
    updateActionLog: dependencies.updateActionLog ?? updateCandidateActionLog,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const CANDIDATE_REPLY_CLAIM_LOST_ERROR = 'candidate or job state changed before automatic reply';
const DUPLICATE_MESSAGE_REPLAY_REASON = 'duplicate external message replay ignored';

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() ? field.trim() : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isJdContent(value: unknown): value is JD {
  if (!value || typeof value !== 'object') return false;
  const content = value as Record<string, unknown>;
  return (
    typeof content.title === 'string' &&
    typeof content.summary === 'string' &&
    isStringArray(content.responsibilities) &&
    isStringArray(content.requirements) &&
    isStringArray(content.bonus) &&
    isStringArray(content.highlights)
  );
}

function isJdTone(value: string): value is JDTone {
  return value === 'startup' || value === 'tech' || value === 'formal';
}

function isJdStatus(value: string): value is JDStatus {
  return (JD_STATUSES as readonly string[]).includes(value);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function resolveJobDescriptionForEvaluation(
  subject: LoadedSubject,
  userId: string,
): JobDescriptionDto | null {
  const jobDescription = subject.jobDescription;
  if (!isJdContent(jobDescription.content)) {
    return null;
  }

  return {
    id: jobDescription.id,
    userId,
    department: jobDescription.department,
    position: jobDescription.position,
    positionDescription: jobDescription.positionDescription,
    salaryRange:
      typeof jobDescription.salaryRange === 'string' && jobDescription.salaryRange.trim()
        ? jobDescription.salaryRange.trim()
        : null,
    workLocations: readStringList(jobDescription.workLocations),
    hiringTarget:
      typeof jobDescription.hiringTarget === 'number' ? jobDescription.hiringTarget : null,
    onboardedCount:
      typeof jobDescription.onboardedCount === 'number' ? jobDescription.onboardedCount : 0,
    tone: isJdTone(jobDescription.tone) ? jobDescription.tone : 'tech',
    status: isJdStatus(jobDescription.status) ? jobDescription.status : 'created',
    content: jobDescription.content,
    evaluation: jobDescription.evaluation as JobDescriptionDto['evaluation'],
    generationMeta: jobDescription.generationMeta as JobDescriptionDto['generationMeta'],
    createdAt: toIsoString(jobDescription.createdAt),
    updatedAt: toIsoString(jobDescription.updatedAt),
  };
}

function resolveJobContext(subject: CandidateCommunicationSubject): {
  title: string;
  summary: string | null;
  salaryRange: string | null;
  highlights: string[];
} {
  const content = subject.jobDescription?.content;
  const title = readStringField(content, 'title') ?? subject.jobDescription?.position ?? '招聘岗位';
  const summary = readStringField(content, 'summary');
  const salaryRange =
    readStringField(content, 'salaryRange') ??
    readStringField(content, 'salary_range') ??
    readStringField(content, 'salary');
  const highlights =
    content &&
    typeof content === 'object' &&
    Array.isArray((content as { highlights?: unknown }).highlights)
      ? (content as { highlights: unknown[] }).highlights.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];

  return { title, summary, salaryRange, highlights };
}

function requireSubject(subject: CandidateCommunicationSubject): LoadedSubject {
  if (!subject.jobDescription) {
    throw new Error('job description not found');
  }
  if (!subject.candidate) {
    throw new Error('candidate not found');
  }

  return {
    jobDescription: subject.jobDescription,
    candidate: subject.candidate,
    latestResume: subject.latestResume,
    screeningResult: subject.screeningResult,
  };
}

function requireLoadedSubject(state: CandidateCommunicationGraphState): LoadedSubject {
  if (!state.subject) {
    throw new Error('candidate communication subject is missing');
  }
  return state.subject;
}

function requireConversation(state: CandidateCommunicationGraphState): CandidateConversationDto {
  if (!state.conversation) {
    throw new Error('candidate communication conversation is missing');
  }
  return state.conversation;
}

function requireIncomingMessage(
  state: CandidateCommunicationGraphState,
): CandidateConversationMessageDto {
  if (!state.incomingMessage) {
    throw new Error('candidate communication incoming message is missing');
  }
  return state.incomingMessage;
}

function requireDecision(state: CandidateCommunicationGraphState): CandidateCommunicationDecision {
  if (!state.decision) {
    throw new Error('candidate communication decision is missing');
  }
  return state.decision;
}

function isClosedStage(stage: CandidateCommunicationStage): boolean {
  return stage === 'contact_exchanged' || stage === 'rejected' || stage === 'closed';
}

function resolveStatus(stage: CandidateCommunicationStage): string {
  return isClosedStage(stage) ? 'closed' : 'active';
}

function resolveOutcomeResult(stage: CandidateCommunicationStage): string | null {
  if (stage === 'contact_exchanged') return 'contact_exchanged';
  if (stage === 'rejected') return 'rejected';
  if (stage === 'closed') return 'no_response';
  return null;
}

function resolveNextFollowUpAt(stage: CandidateCommunicationStage, base: Date): Date | null {
  if (stage === 'waiting_resume' || stage === 'contact_requested') {
    return addHours(base, 24);
  }
  return null;
}

function createReplayDecision(
  conversation: CandidateConversationDto,
): CandidateCommunicationDecision {
  return {
    intent: 'unknown',
    intentLevel: conversation.intentLevel ?? 'low',
    nextStage: conversation.stage,
    shouldReply: false,
    reply: null,
    actions: ['noop'],
    rationale: DUPLICATE_MESSAGE_REPLAY_REASON,
  };
}

async function renewProcessingClaimOrThrow(
  dependencies: CandidateCommunicationGraphDependencies,
  state: CandidateCommunicationGraphState,
): Promise<void> {
  const incomingMessage = requireIncomingMessage(state);
  if (!state.processingClaimId) {
    throw new Error('candidate communication processing claim is missing');
  }
  const renewed = await dependencies.repo.renewIncomingMessageProcessing({
    userId: state.userId,
    messageId: incomingMessage.id,
    claimId: state.processingClaimId,
  });
  if (!renewed) {
    throw new Error('candidate communication processing claim was lost');
  }
}

function toActionPlan(decision: CandidateCommunicationDecision): CandidateActionPlan {
  const priorityByIntent: Record<CandidateIntentLevel, CandidateActionPlan['priority']> = {
    high: 'high',
    medium: 'medium',
    low: 'low',
  };

  return {
    action: 'chat',
    priority: priorityByIntent[decision.intentLevel],
    message: decision.reply,
    reason: decision.rationale,
  };
}

async function sendReply(params: {
  adapter: CandidateSourceAdapter;
  candidate: LoadedSubject['candidate'];
  decision: CandidateCommunicationDecision;
}) {
  await params.adapter.loginIfNeeded();
  return params.adapter.chatCandidate(
    {
      candidateId: params.candidate.id,
      displayName: params.candidate.displayName,
      profileUrl: params.candidate.profileUrl,
    },
    toActionPlan(params.decision),
  );
}

function createMemoryPayload(params: {
  conversationId: string;
  userId: string;
  payload: CandidateMessagePayload;
  subject: LoadedSubject;
  decision: CandidateCommunicationDecision;
  candidateMatchScore: number | null;
}) {
  const outcomeResult = resolveOutcomeResult(params.decision.nextStage);
  if (!outcomeResult) return null;

  return {
    conversationId: params.conversationId,
    userId: params.userId,
    jobDescriptionId: params.payload.jobDescriptionId,
    candidateId: params.payload.candidateId,
    outcomeResult,
    outcomeReason: params.decision.rationale,
    intent: {
      level: params.decision.intentLevel,
      signals: [params.decision.intent],
    },
    profileSummary: {
      years: null,
      skills: [],
      highlights: params.subject.latestResume?.rawText.slice(0, 280) ?? '',
      matchScore: params.candidateMatchScore,
    },
    keyPoints: [],
    dropOffReason: outcomeResult === 'rejected' ? params.decision.rationale : null,
    nextFollowUpAt: null,
  };
}

function makeGraph(dependencies: CandidateCommunicationGraphDependencies) {
  async function loadSubjectNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const subject = requireSubject(
      await dependencies.repo.getSubject({
        userId: state.userId,
        jobDescriptionId: state.payload.jobDescriptionId,
        candidateId: state.payload.candidateId,
      }),
    );
    return { subject };
  }

  async function recordIncomingNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const conversation = await dependencies.repo.findOrCreateConversation({
      userId: state.userId,
      jobDescriptionId: state.payload.jobDescriptionId,
      candidateId: state.payload.candidateId,
      platform: state.payload.platform,
      lastActiveAt: state.payload.message.receivedAt,
    });

    const incomingMessage = await dependencies.repo.createMessage({
      conversationId: conversation.id,
      userId: state.userId,
      jobDescriptionId: state.payload.jobDescriptionId,
      candidateId: state.payload.candidateId,
      platform: state.payload.platform,
      role: 'candidate',
      content: state.payload.message.content,
      externalMessageId: state.payload.message.externalMessageId,
      deliveryStatus: 'received',
      occurredAt: state.payload.message.receivedAt,
    });
    const canonicalReceivedAt = new Date(incomingMessage.occurredAt);
    if (Number.isNaN(canonicalReceivedAt.getTime())) {
      throw new Error('candidate communication incoming message time is invalid');
    }
    const canonicalPayload: CandidateMessagePayload = {
      ...state.payload,
      message: {
        ...state.payload.message,
        receivedAt: canonicalReceivedAt,
      },
    };

    const processing = await dependencies.repo.claimIncomingMessageProcessing({
      userId: state.userId,
      messageId: incomingMessage.id,
    });
    if (processing.status === 'processed' || processing.status === 'in_flight') {
      return {
        conversation,
        incomingMessage,
        payload: canonicalPayload,
        processingStatus: processing.status,
        completionOutcome: processing.status === 'processed' ? processing.outcome : undefined,
        history: [],
      };
    }
    if (processing.status === 'resume_finalization') {
      return {
        conversation,
        incomingMessage,
        payload: canonicalPayload,
        processingClaimId: processing.claimId,
        processingStatus: processing.status,
        decision: processing.decision,
        outgoingMessage: processing.outgoingMessage,
        completionOutcome: processing.completionOutcome,
        history: [],
      };
    }

    await dependencies.repo.markCandidateReplied({
      userId: state.userId,
      candidateId: state.payload.candidateId,
      lastActiveAt: canonicalReceivedAt,
    });

    const history = await dependencies.repo.listRecentMessages({
      conversationId: conversation.id,
      limit: 20,
    });

    return {
      conversation,
      incomingMessage,
      payload: canonicalPayload,
      processingClaimId: processing.claimId,
      processingStatus: processing.status,
      decision: processing.decision,
      history,
    };
  }

  function finishReplayNode(
    state: CandidateCommunicationGraphState,
  ): CandidateCommunicationGraphUpdate {
    const conversation = requireConversation(state);
    return {
      decision: createReplayDecision(conversation),
      outgoingMessage: null,
      updatedConversation: conversation,
    };
  }

  function routeAfterIncoming(
    state: CandidateCommunicationGraphState,
  ): 'finish_replay' | 'resume_send' | 'resume_finalization' | 'evaluate_resume' {
    if (state.processingStatus === 'claimed') {
      return state.decision ? 'resume_send' : 'evaluate_resume';
    }
    if (state.processingStatus === 'resume_finalization') return 'resume_finalization';
    return 'finish_replay';
  }

  async function evaluateResumeNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const subject = requireLoadedSubject(state);
    const existingScore = subject.screeningResult?.finalScore ?? null;
    if (existingScore !== null) {
      return {
        candidateMatchScore: existingScore,
        resumeEvaluationSource: 'screening_result',
      };
    }

    if (!subject.latestResume) {
      return {
        candidateMatchScore: null,
        resumeEvaluationSource: 'none',
      };
    }

    const jobDescription = resolveJobDescriptionForEvaluation(subject, state.userId);
    if (!jobDescription) {
      return {
        candidateMatchScore: null,
        resumeEvaluationSource: 'none',
      };
    }

    const { evaluationSchema } = dependencies.buildPlan(jobDescription);
    const evaluation = await dependencies.evaluateCandidate({
      jobTitle: jobDescription.position,
      evaluationSchema,
      resumeText: subject.latestResume.rawText,
      candidateName: subject.candidate.displayName,
      strict: dependencies.strictResumeEvaluation,
    });

    return {
      candidateMatchScore: evaluation.score.total,
      resumeEvaluationSource: 'latest_resume_evaluation',
    };
  }

  async function decideReplyNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const subject = requireLoadedSubject(state);
    const conversation = requireConversation(state);
    const decision = await decideCandidateCommunication({
      currentStage: conversation.stage,
      message: state.payload.message.content,
      candidate: {
        displayName: subject.candidate.displayName,
        matchScore: state.candidateMatchScore,
        hasResume: Boolean(subject.latestResume),
      },
      job: resolveJobContext(subject),
      history: state.history.map((message) => ({ role: message.role, content: message.content })),
      runLLM: dependencies.runLLM,
      strictLlm: dependencies.strictLlm,
    });
    return { decision };
  }

  async function sendReplyNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const subject = requireLoadedSubject(state);
    const conversation = requireConversation(state);
    const incomingMessage = requireIncomingMessage(state);
    const decision = requireDecision(state);

    if (!decision.shouldReply || !decision.reply) {
      return { outgoingMessage: null };
    }
    if (!isCandidateOutreachAllowedJobStatus(subject.jobDescription.status)) {
      return { outgoingMessage: null };
    }
    if (
      subject.screeningResult &&
      isTerminalCandidateInterviewStage(subject.screeningResult.interviewStage)
    ) {
      return { outgoingMessage: null };
    }
    if (
      state.payload.executeReply &&
      !subject.screeningResult &&
      !(await dependencies.claimJobDescriptionOutreach({
        userId: state.userId,
        jobDescriptionId: state.payload.jobDescriptionId,
        candidateId: state.payload.candidateId,
      }))
    ) {
      return { outgoingMessage: null };
    }

    // Fence the owner before creating any durable outbound state. Otherwise an expired
    // worker could leave a running action/planned message that a new owner must treat as
    // an ambiguous delivery even though no platform command was issued.
    await renewProcessingClaimOrThrow(dependencies, state);

    let claimedActionLog: Awaited<ReturnType<typeof claimCandidateActionLog>> = null;
    if (state.payload.executeReply && subject.screeningResult) {
      const actionLog = await dependencies.createActionLog({
        userId: state.userId,
        runId: subject.screeningResult.runId,
        screeningResultId: subject.screeningResult.id,
        candidateId: state.payload.candidateId,
        jobDescriptionId: state.payload.jobDescriptionId,
        platform: state.payload.platform,
        mode: 'execution',
        action: 'chat',
        message: decision.reply,
        status: 'planned',
        idempotencyKey: candidateCommunicationActionIdempotencyKey(incomingMessage.id),
      });
      claimedActionLog = await dependencies.claimActionLog({
        userId: state.userId,
        id: actionLog.id,
        expectedInterviewStage: subject.screeningResult.interviewStage,
      });
      if (!claimedActionLog) {
        if (actionLog.status === 'running') {
          throw new Error('candidate reply action is already running');
        }
        if (actionLog.status !== 'planned') {
          return { outgoingMessage: null };
        }
        const skipped = await dependencies.updateActionLog({
          userId: state.userId,
          id: actionLog.id,
          expectedStatus: 'planned',
          status: 'skipped',
          errorMessage: CANDIDATE_REPLY_CLAIM_LOST_ERROR,
        });
        if (!skipped) {
          throw new Error('candidate reply action is already running');
        }
        return { outgoingMessage: null };
      }
    }

    let outgoingMessage: CandidateConversationMessageDto;
    let adapter: CandidateSourceAdapter | null = null;
    let actionLogFinalized = false;
    try {
      outgoingMessage = await dependencies.repo.createMessage({
        conversationId: conversation.id,
        userId: state.userId,
        jobDescriptionId: state.payload.jobDescriptionId,
        candidateId: state.payload.candidateId,
        platform: state.payload.platform,
        role: 'agent',
        content: decision.reply,
        externalMessageId: candidateCommunicationReplyExternalMessageId(incomingMessage.id),
        deliveryStatus: state.payload.executeReply ? 'planned' : 'sent',
        occurredAt: new Date(),
      });

      if (state.payload.executeReply) {
        await renewProcessingClaimOrThrow(dependencies, state);
        adapter = await dependencies.createAdapter(state.payload.platform, {
          userId: state.userId,
        });
        const executionResult = await sendReply({
          adapter,
          candidate: subject.candidate,
          decision,
        });
        if (claimedActionLog) {
          await dependencies.updateActionLog({
            userId: state.userId,
            id: claimedActionLog.id,
            expectedStatus: 'running',
            status: executionResult.success ? 'success' : 'failed',
            browserTrace: executionResult.browserTrace ?? null,
            errorMessage: executionResult.success
              ? null
              : (executionResult.error ?? 'candidate reply execution failed'),
          });
          actionLogFinalized = true;
        }
        const updatedOutgoing = await dependencies.repo.updateMessageDelivery({
          userId: state.userId,
          messageId: outgoingMessage.id,
          deliveryStatus: executionResult.success ? 'sent' : 'failed',
          browserTrace: executionResult.browserTrace ?? null,
          errorMessage: executionResult.success
            ? null
            : (executionResult.error ?? 'candidate reply execution failed'),
        });
        if (!updatedOutgoing) {
          throw new Error('candidate reply delivery state was not persisted');
        }
        outgoingMessage = updatedOutgoing;
      }
    } catch (error) {
      if (claimedActionLog && !actionLogFinalized) {
        await dependencies.updateActionLog({
          userId: state.userId,
          id: claimedActionLog.id,
          expectedStatus: 'running',
          status: 'failed',
          errorMessage: getErrorMessage(error),
        });
      }
      throw error;
    } finally {
      if (adapter && dependencies.closeAdapterAfterReply) {
        await adapter.close();
      }
    }

    return { outgoingMessage };
  }

  async function persistDecisionNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const conversation = requireConversation(state);
    const incomingMessage = requireIncomingMessage(state);
    const decision = requireDecision(state);
    // The LLM may finish after its lease was taken over. Fence before persisting and use
    // the repository's unique, canonical decision for every downstream side effect.
    await renewProcessingClaimOrThrow(dependencies, state);
    const persistedDecision = await dependencies.repo.createDecision({
      conversationId: conversation.id,
      userId: state.userId,
      jobDescriptionId: state.payload.jobDescriptionId,
      candidateId: state.payload.candidateId,
      inputMessageId: incomingMessage.id,
      outputMessageId: null,
      intent: decision.intent,
      intentLevel: decision.intentLevel,
      nextStage: decision.nextStage,
      shouldReply: decision.shouldReply,
      reply: decision.reply,
      actions: decision.actions,
      rationale: decision.rationale,
      llmMeta: { resumeEvaluationSource: state.resumeEvaluationSource },
    });
    return { decision: persistedDecision };
  }

  async function linkDecisionOutputNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const incomingMessage = requireIncomingMessage(state);
    const decision = requireDecision(state);
    if ('outputMessageId' in decision && decision.outputMessageId && !state.outgoingMessage) {
      return {};
    }
    const linked = await dependencies.repo.updateDecisionOutput({
      userId: state.userId,
      inputMessageId: incomingMessage.id,
      outputMessageId: state.outgoingMessage?.id ?? null,
    });
    if (!linked) {
      throw new Error('candidate communication decision output conflict');
    }
    return {};
  }

  async function finalizeConversationNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const subject = requireLoadedSubject(state);
    const conversation = requireConversation(state);
    const decision = requireDecision(state);
    const outgoingMessage = state.outgoingMessage ?? null;
    const incomingMessage = requireIncomingMessage(state);
    if (!state.processingClaimId) {
      throw new Error('candidate communication processing claim is missing');
    }

    const memoryPayload = createMemoryPayload({
      conversationId: conversation.id,
      userId: state.userId,
      payload: state.payload,
      subject,
      decision,
      candidateMatchScore: state.candidateMatchScore,
    });
    const updatedConversation = await dependencies.repo.finalizeCandidateDecision({
      userId: state.userId,
      messageId: incomingMessage.id,
      claimId: state.processingClaimId,
      inputMessageId: incomingMessage.id,
      interviewStage: decision.nextStage === 'rejected' ? 'withdrawn' : 'replied',
      conversation: {
        conversationId: conversation.id,
        userId: state.userId,
        jobDescriptionId: state.payload.jobDescriptionId,
        candidateId: state.payload.candidateId,
        stage: decision.nextStage,
        status: resolveStatus(decision.nextStage),
        intentLevel: decision.intentLevel,
        messageCountIncrement: 1 + (outgoingMessage ? 1 : 0),
        lastActiveAt: state.payload.message.receivedAt,
        lastCandidateMessageAt: state.payload.message.receivedAt,
        lastAgentMessageAt: outgoingMessage ? new Date(outgoingMessage.occurredAt) : null,
        nextFollowUpAt: resolveNextFollowUpAt(decision.nextStage, state.payload.message.receivedAt),
        outcomeResult: resolveOutcomeResult(decision.nextStage),
        outcomeReason: resolveOutcomeResult(decision.nextStage) ? decision.rationale : null,
      },
      memory: memoryPayload,
    });
    if (!updatedConversation) {
      throw new Error('candidate communication processing claim was lost before finalization');
    }

    return { updatedConversation };
  }

  async function completeProcessingNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const incomingMessage = requireIncomingMessage(state);
    if (!state.processingClaimId) {
      throw new Error('candidate communication processing claim is missing');
    }
    const outcome =
      state.completionOutcome ??
      (state.outgoingMessage?.deliveryStatus === 'failed'
        ? 'delivery_failed'
        : 'processed_ackable');
    const completed = await dependencies.repo.completeIncomingMessageProcessing({
      userId: state.userId,
      messageId: incomingMessage.id,
      claimId: state.processingClaimId,
      outcome,
      errorMessage:
        outcome === 'processed_ackable'
          ? null
          : (state.outgoingMessage?.errorMessage ??
            (outcome === 'delivery_unknown'
              ? CANDIDATE_COMMUNICATION_DELIVERY_UNKNOWN_ERROR
              : null)),
    });
    if (!completed) {
      throw new Error('candidate communication processing claim was lost');
    }
    return { processingStatus: 'processed', completionOutcome: outcome };
  }

  return new StateGraph(CandidateCommunicationGraphState)
    .addNode('load_subject', loadSubjectNode)
    .addNode('record_incoming', recordIncomingNode)
    .addNode('finish_replay', finishReplayNode)
    .addNode('evaluate_resume', evaluateResumeNode)
    .addNode('decide_reply', decideReplyNode)
    .addNode('persist_decision', persistDecisionNode)
    .addNode('send_reply', sendReplyNode)
    .addNode('link_decision_output', linkDecisionOutputNode)
    .addNode('finalize_conversation', finalizeConversationNode)
    .addNode('complete_processing', completeProcessingNode)
    .addEdge(START, 'load_subject')
    .addEdge('load_subject', 'record_incoming')
    .addConditionalEdges('record_incoming', routeAfterIncoming, {
      finish_replay: 'finish_replay',
      resume_send: 'send_reply',
      resume_finalization: 'link_decision_output',
      evaluate_resume: 'evaluate_resume',
    })
    .addEdge('finish_replay', END)
    .addEdge('evaluate_resume', 'decide_reply')
    .addEdge('decide_reply', 'persist_decision')
    .addEdge('persist_decision', 'send_reply')
    .addEdge('send_reply', 'link_decision_output')
    .addEdge('link_decision_output', 'finalize_conversation')
    .addEdge('finalize_conversation', 'complete_processing')
    .addEdge('complete_processing', END)
    .compile();
}

export async function runCandidateCommunicationGraph(params: {
  userId: string;
  payload: CandidateMessagePayload;
  dependencies?: CandidateCommunicationGraphDependencyOverrides;
}): Promise<CandidateCommunicationGraphResult> {
  const graph = makeGraph(withDefaultDependencies(params.dependencies));
  const result = await graph.invoke({
    userId: params.userId,
    payload: params.payload,
    subject: undefined,
    conversation: undefined,
    incomingMessage: undefined,
    processingClaimId: null,
    processingStatus: undefined,
    completionOutcome: undefined,
    history: [],
    candidateMatchScore: null,
    resumeEvaluationSource: 'none',
    decision: undefined,
    outgoingMessage: undefined,
    updatedConversation: undefined,
  });

  if (
    !result.updatedConversation ||
    !result.incomingMessage ||
    !result.decision ||
    (result.processingStatus !== 'processed' && result.processingStatus !== 'in_flight') ||
    (result.processingStatus === 'processed' && !result.completionOutcome)
  ) {
    throw new Error('candidate communication graph finished without a complete result');
  }

  const processingOutcome =
    result.processingStatus === 'in_flight' ? 'in_flight' : result.completionOutcome!;
  return {
    conversation: result.updatedConversation,
    incomingMessage: result.incomingMessage,
    outgoingMessage: result.outgoingMessage ?? null,
    decision: result.decision,
    processingStatus: result.processingStatus,
    processingOutcome,
    ackable: processingOutcome === 'processed_ackable',
  };
}
