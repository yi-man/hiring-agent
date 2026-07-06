import type {
  CandidateDecisionAction,
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateInterviewStage,
  CandidateScreeningRunStage,
  CandidateScreeningRunStatus,
} from './types';

export const CANDIDATE_SCREENING_RUN_STAGES = [
  'planning',
  'searching_live',
  'ingesting_live',
  'indexing_resumes',
  'recalling_vectors',
  'evaluating',
  'ranking',
  'planning_actions',
  'executing_actions',
  'finalizing',
] as const satisfies readonly CandidateScreeningRunStage[];

export const CANDIDATE_SCREENING_RUN_STATUSES = [
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
] as const satisfies readonly CandidateScreeningRunStatus[];

export const CANDIDATE_SCREENING_INTERVIEW_STAGES = [
  'sourced',
  'screened',
  'to_contact',
  'collected',
  'contacted',
  'replied',
  'phone_screen',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const satisfies readonly CandidateInterviewStage[];

export const CANDIDATE_INTERVIEW_FEEDBACK_STAGES = [
  'first_interview',
  'second_interview',
  'final_interview',
] as const satisfies readonly CandidateInterviewFeedbackStage[];

export const CANDIDATE_INTERVIEW_FEEDBACK_DECISIONS = [
  'pass',
  'reject',
  'hold',
] as const satisfies readonly CandidateInterviewFeedbackDecision[];

export const CANDIDATE_SCREENING_DECISION_ACTIONS = [
  'chat',
  'collect',
  'skip',
] as const satisfies readonly CandidateDecisionAction[];

export const DEFAULT_SCREENING_BATCH_SIZE = 10;
export const DEFAULT_SCREENING_MAX_CANDIDATES = 50;
export const MAX_SCREENING_MAX_CANDIDATES = 200;
export const QUALIFIED_CANDIDATE_SCORE = 70;
export const DEFAULT_MAX_CHAT_ACTIONS = 10;
export const DEFAULT_MAX_COLLECT_ACTIONS = 30;
