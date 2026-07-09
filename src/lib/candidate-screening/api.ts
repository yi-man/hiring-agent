import {
  CANDIDATE_INTERVIEW_FEEDBACK_DECISIONS,
  CANDIDATE_INTERVIEW_FEEDBACK_STAGES,
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
  DEFAULT_MAX_CHAT_ACTIONS,
  DEFAULT_MAX_COLLECT_ACTIONS,
  DEFAULT_EXECUTION_SCREENING_MAX_CANDIDATES,
  DEFAULT_SCREENING_BATCH_SIZE,
  DEFAULT_SCREENING_MAX_CANDIDATES,
  MAX_SCREENING_MAX_CANDIDATES,
} from './constants';
import type {
  CandidateInterviewStage,
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateScreeningMode,
  CandidateScreeningPlatform,
  CreateScreeningRunRequest,
  EvaluateCandidateDecisionRequest,
  ExecuteActionsRequest,
  UpdateCandidateProgressRequest,
  UpsertCandidateInterviewFeedbackRequest,
} from './types';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_SCREENING_BATCH_SIZE = 50;
const MAX_CHAT_ACTIONS = 100;
const MAX_COLLECT_ACTIONS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isCandidateScreeningPlatform(value: unknown): value is CandidateScreeningPlatform {
  return value === 'boss-like';
}

function isCandidateScreeningMode(value: unknown): value is CandidateScreeningMode {
  return value === 'dry_run' || value === 'execution';
}

function isCandidateInterviewStage(value: unknown): value is CandidateInterviewStage {
  return (
    typeof value === 'string' &&
    CANDIDATE_SCREENING_INTERVIEW_STAGES.includes(value as CandidateInterviewStage)
  );
}

function isCandidateInterviewFeedbackStage(
  value: unknown,
): value is CandidateInterviewFeedbackStage {
  return (
    typeof value === 'string' &&
    CANDIDATE_INTERVIEW_FEEDBACK_STAGES.includes(value as CandidateInterviewFeedbackStage)
  );
}

function isCandidateInterviewFeedbackDecision(
  value: unknown,
): value is CandidateInterviewFeedbackDecision {
  return (
    typeof value === 'string' &&
    CANDIDATE_INTERVIEW_FEEDBACK_DECISIONS.includes(value as CandidateInterviewFeedbackDecision)
  );
}

function cleanStringArray(value: unknown, fieldName: string): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array of strings` };
  }

  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return { ok: false, error: `${fieldName} must be an array of strings` };
    }
    const trimmed = item.trim();
    if (trimmed) {
      result.push(trimmed);
    }
  }
  return { ok: true, value: result };
}

export function parseCreateScreeningRunPayload(
  body: unknown,
): ValidationResult<CreateScreeningRunRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  if (!isCandidateScreeningPlatform(body.platform)) {
    return { ok: false, error: 'platform is invalid' };
  }

  const mode = body.mode === undefined ? 'dry_run' : body.mode;
  if (!isCandidateScreeningMode(mode)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const defaultMaxCandidates =
    mode === 'execution'
      ? DEFAULT_EXECUTION_SCREENING_MAX_CANDIDATES
      : DEFAULT_SCREENING_MAX_CANDIDATES;
  const maxCandidates =
    body.maxCandidates === undefined ? defaultMaxCandidates : body.maxCandidates;
  if (!isIntegerInRange(maxCandidates, 1, MAX_SCREENING_MAX_CANDIDATES)) {
    return { ok: false, error: 'maxCandidates must be between 1 and 200' };
  }

  const batchSize = body.batchSize === undefined ? DEFAULT_SCREENING_BATCH_SIZE : body.batchSize;
  if (!isIntegerInRange(batchSize, 1, MAX_SCREENING_BATCH_SIZE)) {
    return { ok: false, error: 'batchSize must be between 1 and 50' };
  }

  return {
    ok: true,
    value: {
      platform: body.platform,
      mode,
      maxCandidates,
      batchSize,
      allowAlreadyContacted:
        typeof body.allowAlreadyContacted === 'boolean' ? body.allowAlreadyContacted : false,
    },
  };
}

export function parseExecuteActionsPayload(body: unknown): ValidationResult<ExecuteActionsRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  if (body.confirmExecution !== true) {
    return { ok: false, error: 'confirmExecution must be true' };
  }

  const maxChatActions =
    body.maxChatActions === undefined ? DEFAULT_MAX_CHAT_ACTIONS : body.maxChatActions;
  if (!isIntegerInRange(maxChatActions, 1, MAX_CHAT_ACTIONS)) {
    return { ok: false, error: 'maxChatActions must be between 1 and 100' };
  }

  const maxCollectActions =
    body.maxCollectActions === undefined ? DEFAULT_MAX_COLLECT_ACTIONS : body.maxCollectActions;
  if (!isIntegerInRange(maxCollectActions, 1, MAX_COLLECT_ACTIONS)) {
    return { ok: false, error: 'maxCollectActions must be between 1 and 200' };
  }

  return {
    ok: true,
    value: {
      confirmExecution: true,
      maxChatActions,
      maxCollectActions,
    },
  };
}

export function parseUpdateCandidateProgressPayload(
  body: unknown,
): ValidationResult<UpdateCandidateProgressRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const value: UpdateCandidateProgressRequest = {};

  if (body.interviewStage !== undefined) {
    if (!isCandidateInterviewStage(body.interviewStage)) {
      return { ok: false, error: 'interviewStage is invalid' };
    }
    value.interviewStage = body.interviewStage;
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') {
      return { ok: false, error: 'notes must be a string' };
    }
    value.notes = cleanText(body.notes);
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'at least one field is required' };
  }

  return { ok: true, value };
}

export function parseUpsertCandidateInterviewFeedbackPayload(
  body: unknown,
): ValidationResult<UpsertCandidateInterviewFeedbackRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  if (!isCandidateInterviewFeedbackStage(body.stage)) {
    return { ok: false, error: 'stage is invalid' };
  }

  const interviewer = cleanText(body.interviewer);
  if (!interviewer) {
    return { ok: false, error: 'interviewer is required' };
  }

  if (typeof body.rating !== 'number' || !Number.isFinite(body.rating)) {
    return { ok: false, error: 'rating must be between 1 and 5' };
  }
  if (body.rating < 1 || body.rating > 5) {
    return { ok: false, error: 'rating must be between 1 and 5' };
  }

  const pros = cleanStringArray(body.pros ?? [], 'pros');
  if (!pros.ok) return pros;

  const cons = cleanStringArray(body.cons ?? [], 'cons');
  if (!cons.ok) return cons;

  if (!isCandidateInterviewFeedbackDecision(body.decision)) {
    return { ok: false, error: 'decision is invalid' };
  }

  return {
    ok: true,
    value: {
      stage: body.stage,
      interviewer,
      rating: body.rating,
      pros: pros.value,
      cons: cons.value,
      decision: body.decision,
      notes: body.notes === undefined ? null : cleanText(body.notes),
    },
  };
}

export function parseEvaluateCandidateDecisionPayload(
  body: unknown,
): ValidationResult<EvaluateCandidateDecisionRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const jobDescriptionId = cleanText(body.jobDescriptionId ?? body.job_description_id);
  if (!jobDescriptionId) {
    return { ok: false, error: 'job description id is required' };
  }

  const candidateId = cleanText(body.candidateId ?? body.candidate_id);
  if (!candidateId) {
    return { ok: false, error: 'candidate id is required' };
  }

  return { ok: true, value: { jobDescriptionId, candidateId } };
}
