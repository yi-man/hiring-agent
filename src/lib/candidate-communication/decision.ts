import { z } from 'zod';
import { CANDIDATE_COMMUNICATION_STAGES } from './constants';
import { classifyCandidateMessage, shouldSuppressAutomatedReply } from './rules';
import type {
  CandidateCommunicationAction,
  CandidateCommunicationDecision,
  CandidateCommunicationStage,
  CandidateIntentLevel,
  CandidateMessageIntent,
} from './types';

const ACTIONS = [
  'reply',
  'request_resume',
  'request_contact',
  'capture_resume',
  'capture_contact',
  'answer_question',
  'mark_rejected',
  'close',
  'noop',
] as const satisfies readonly CandidateCommunicationAction[];

const INTENTS = [
  'greeting',
  'resume_shared',
  'salary_question',
  'job_question',
  'contact_shared',
  'not_interested',
  'unknown',
] as const satisfies readonly CandidateMessageIntent[];

const INTENT_LEVELS = ['high', 'medium', 'low'] as const satisfies readonly CandidateIntentLevel[];

const decisionSchema = z.object({
  intent: z.enum(INTENTS),
  intentLevel: z.enum(INTENT_LEVELS),
  nextStage: z.enum(CANDIDATE_COMMUNICATION_STAGES),
  shouldReply: z.boolean(),
  reply: z.string().trim().min(1).nullable(),
  actions: z.array(z.enum(ACTIONS)).min(1),
  rationale: z.string().trim().min(1),
});

export type CandidateCommunicationHistoryMessage = {
  role: 'candidate' | 'agent';
  content: string;
};

export type CandidateCommunicationDecisionContext = {
  currentStage: CandidateCommunicationStage;
  message: string;
  candidate: {
    displayName: string;
    matchScore?: number | null;
    hasResume: boolean;
  };
  job: {
    title: string;
    summary?: string | null;
    salaryRange?: string | null;
    highlights?: string[];
  };
  history: CandidateCommunicationHistoryMessage[];
};

export type CandidateCommunicationLlmInput = CandidateCommunicationDecisionContext & {
  ruleIntent: CandidateMessageIntent;
  ruleIntentLevel: CandidateIntentLevel;
};

export type RunCandidateCommunicationLLM = (
  input: CandidateCommunicationLlmInput,
) => Promise<unknown>;

export type DecideCandidateCommunicationParams = CandidateCommunicationDecisionContext & {
  runLLM?: RunCandidateCommunicationLLM;
  strictLlm?: boolean;
};

function parseDecision(value: unknown): CandidateCommunicationDecision {
  const decision = decisionSchema.parse(value);
  if (!decision.shouldReply) {
    return { ...decision, reply: null };
  }
  return decision;
}

function createQuestionReply(params: {
  job: CandidateCommunicationDecisionContext['job'];
  askForContact: boolean;
}): string {
  const summary = params.job.summary?.trim() || `${params.job.title}岗位`;
  const salary = params.job.salaryRange?.trim()
    ? `薪资范围大致是 ${params.job.salaryRange.trim()}。`
    : '';
  const suffix = params.askForContact
    ? '如果你方便的话，可以加个微信进一步沟通。'
    : '也方便先发一份简历，我可以结合经历更准确地判断匹配度。';

  return [summary, salary, suffix].filter(Boolean).join(' ');
}

function createRuleDecision(
  params: CandidateCommunicationLlmInput,
): CandidateCommunicationDecision {
  const intent = params.ruleIntent;
  const intentLevel = params.ruleIntentLevel;

  if (shouldSuppressAutomatedReply(params.currentStage)) {
    return {
      intent,
      intentLevel: 'low',
      nextStage: params.currentStage,
      shouldReply: false,
      reply: null,
      actions: ['noop'],
      rationale: 'conversation is already in a terminal no-reply stage',
    };
  }

  if (intent === 'not_interested') {
    return {
      intent,
      intentLevel,
      nextStage: 'rejected',
      shouldReply: true,
      reply: '好的，感谢回复。后续有更合适的机会我再联系你，祝顺利。',
      actions: ['reply', 'mark_rejected', 'close'],
      rationale: 'candidate explicitly declined the opportunity',
    };
  }

  if (intent === 'contact_shared') {
    return {
      intent,
      intentLevel,
      nextStage: 'contact_exchanged',
      shouldReply: true,
      reply: '收到，我稍后加你，后续我们在微信上继续沟通。',
      actions: ['reply', 'capture_contact', 'close'],
      rationale: 'candidate shared private contact information',
    };
  }

  if (intent === 'resume_shared') {
    return {
      intent,
      intentLevel,
      nextStage: 'resume_received',
      shouldReply: true,
      reply: '收到简历，我先快速看一下你的经历，匹配的话我们再约进一步沟通。',
      actions: ['reply', 'capture_resume'],
      rationale: 'candidate indicated a resume was sent or available',
    };
  }

  if (intent === 'salary_question' || intent === 'job_question') {
    const askForContact = params.candidate.hasResume;
    return {
      intent,
      intentLevel,
      nextStage: askForContact ? 'contact_requested' : 'waiting_resume',
      shouldReply: true,
      reply: createQuestionReply({ job: params.job, askForContact }),
      actions: askForContact
        ? ['reply', 'answer_question', 'request_contact']
        : ['reply', 'answer_question', 'request_resume'],
      rationale: 'answered candidate question and paired the answer with the next conversion step',
    };
  }

  if (params.candidate.hasResume) {
    return {
      intent,
      intentLevel,
      nextStage: 'contact_requested',
      shouldReply: true,
      reply: `你好，看到你的经历和${params.job.title}比较匹配，方便加个微信进一步沟通吗？`,
      actions: ['reply', 'request_contact'],
      rationale: 'candidate appears qualified enough to request private contact',
    };
  }

  return {
    intent,
    intentLevel,
    nextStage: 'waiting_resume',
    shouldReply: true,
    reply: `你好，${params.job.title}还在招聘。方便先发一份简历或简单介绍下最近的项目经历吗？`,
    actions: ['reply', 'request_resume'],
    rationale: 'candidate greeted without enough profile evidence, so resume is the next step',
  };
}

export async function decideCandidateCommunication(
  params: DecideCandidateCommunicationParams,
): Promise<CandidateCommunicationDecision> {
  const classification = classifyCandidateMessage(params.message);
  const llmInput: CandidateCommunicationLlmInput = {
    currentStage: params.currentStage,
    message: params.message,
    candidate: params.candidate,
    job: params.job,
    history: params.history,
    ruleIntent: classification.intent,
    ruleIntentLevel: classification.intentLevel,
  };

  if (params.runLLM) {
    try {
      return parseDecision(await params.runLLM(llmInput));
    } catch (error) {
      if (params.strictLlm) {
        throw error;
      }
    }
  } else if (params.strictLlm) {
    throw new Error('candidate communication LLM runner is required in strict mode');
  }

  return createRuleDecision(llmInput);
}
