import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { addHours } from 'date-fns';
import { createCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/factory';
import type { CandidateSourceAdapter } from '@/lib/candidate-screening/adapters/types';
import { evaluateCandidateForJd } from '@/lib/candidate-screening/evaluation';
import { buildScreeningPlanFromJd } from '@/lib/candidate-screening/planner';
import type { CandidateActionPlan } from '@/lib/candidate-screening/types';
import { JD_STATUSES, type JD, type JDStatus, type JDTone, type JobDescriptionDto } from '@/types';
import { decideCandidateCommunication, type RunCandidateCommunicationLLM } from './decision';
import { runCandidateCommunicationLLM } from './llm';
import {
  prismaCandidateConversationRepository,
  type CandidateCommunicationSubject,
  type CandidateConversationDto,
  type CandidateConversationMessageDto,
  type CandidateConversationRepository,
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
  };
}

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

    await dependencies.repo.markCandidateReplied({
      userId: state.userId,
      candidateId: state.payload.candidateId,
      lastActiveAt: state.payload.message.receivedAt,
    });

    const history = await dependencies.repo.listRecentMessages({
      conversationId: conversation.id,
      limit: 20,
    });

    return { conversation, incomingMessage, history };
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
    const decision = requireDecision(state);

    if (!decision.shouldReply || !decision.reply) {
      return { outgoingMessage: null };
    }

    let outgoingMessage = await dependencies.repo.createMessage({
      conversationId: conversation.id,
      userId: state.userId,
      jobDescriptionId: state.payload.jobDescriptionId,
      candidateId: state.payload.candidateId,
      platform: state.payload.platform,
      role: 'agent',
      content: decision.reply,
      deliveryStatus: state.payload.executeReply ? 'planned' : 'sent',
      occurredAt: new Date(),
    });

    if (state.payload.executeReply) {
      const adapter = dependencies.createAdapter(state.payload.platform);
      try {
        const executionResult = await sendReply({
          adapter,
          candidate: subject.candidate,
          decision,
        });
        outgoingMessage =
          (await dependencies.repo.updateMessageDelivery({
            userId: state.userId,
            messageId: outgoingMessage.id,
            deliveryStatus: executionResult.success ? 'sent' : 'failed',
            browserTrace: executionResult.browserTrace ?? null,
            errorMessage: executionResult.success
              ? null
              : (executionResult.error ?? 'candidate reply execution failed'),
          })) ?? outgoingMessage;
      } finally {
        if (dependencies.closeAdapterAfterReply) {
          await adapter.close();
        }
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
    await dependencies.repo.createDecision({
      conversationId: conversation.id,
      userId: state.userId,
      jobDescriptionId: state.payload.jobDescriptionId,
      candidateId: state.payload.candidateId,
      inputMessageId: incomingMessage.id,
      outputMessageId: state.outgoingMessage?.id ?? null,
      intent: decision.intent,
      intentLevel: decision.intentLevel,
      nextStage: decision.nextStage,
      shouldReply: decision.shouldReply,
      reply: decision.reply,
      actions: decision.actions,
      rationale: decision.rationale,
      llmMeta: { resumeEvaluationSource: state.resumeEvaluationSource },
    });
    return {};
  }

  async function finalizeConversationNode(
    state: CandidateCommunicationGraphState,
  ): Promise<CandidateCommunicationGraphUpdate> {
    const subject = requireLoadedSubject(state);
    const conversation = requireConversation(state);
    const decision = requireDecision(state);
    const outgoingMessage = state.outgoingMessage ?? null;

    const updatedConversation = await dependencies.repo.updateConversation({
      conversationId: conversation.id,
      userId: state.userId,
      jobDescriptionId: state.payload.jobDescriptionId,
      candidateId: state.payload.candidateId,
      stage: decision.nextStage,
      status: resolveStatus(decision.nextStage),
      intentLevel: decision.intentLevel,
      messageCount: conversation.messageCount + 1 + (outgoingMessage ? 1 : 0),
      lastActiveAt: state.payload.message.receivedAt,
      lastCandidateMessageAt: state.payload.message.receivedAt,
      lastAgentMessageAt: outgoingMessage ? new Date(outgoingMessage.occurredAt) : null,
      nextFollowUpAt: resolveNextFollowUpAt(decision.nextStage, state.payload.message.receivedAt),
      outcomeResult: resolveOutcomeResult(decision.nextStage),
      outcomeReason: resolveOutcomeResult(decision.nextStage) ? decision.rationale : null,
    });

    const memoryPayload = createMemoryPayload({
      conversationId: conversation.id,
      userId: state.userId,
      payload: state.payload,
      subject,
      decision,
      candidateMatchScore: state.candidateMatchScore,
    });
    if (memoryPayload) {
      await dependencies.repo.createMemory(memoryPayload);
    }

    return { updatedConversation };
  }

  return new StateGraph(CandidateCommunicationGraphState)
    .addNode('load_subject', loadSubjectNode)
    .addNode('record_incoming', recordIncomingNode)
    .addNode('evaluate_resume', evaluateResumeNode)
    .addNode('decide_reply', decideReplyNode)
    .addNode('send_reply', sendReplyNode)
    .addNode('persist_decision', persistDecisionNode)
    .addNode('finalize_conversation', finalizeConversationNode)
    .addEdge(START, 'load_subject')
    .addEdge('load_subject', 'record_incoming')
    .addEdge('record_incoming', 'evaluate_resume')
    .addEdge('evaluate_resume', 'decide_reply')
    .addEdge('decide_reply', 'send_reply')
    .addEdge('send_reply', 'persist_decision')
    .addEdge('persist_decision', 'finalize_conversation')
    .addEdge('finalize_conversation', END)
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
    history: [],
    candidateMatchScore: null,
    resumeEvaluationSource: 'none',
    decision: undefined,
    outgoingMessage: undefined,
    updatedConversation: undefined,
  });

  if (!result.updatedConversation || !result.incomingMessage || !result.decision) {
    throw new Error('candidate communication graph finished without a complete result');
  }

  return {
    conversation: result.updatedConversation,
    incomingMessage: result.incomingMessage,
    outgoingMessage: result.outgoingMessage ?? null,
    decision: result.decision,
  };
}
