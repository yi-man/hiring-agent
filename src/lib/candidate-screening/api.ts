import {
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
  DEFAULT_MAX_CHAT_ACTIONS,
  DEFAULT_MAX_COLLECT_ACTIONS,
  DEFAULT_SCREENING_BATCH_SIZE,
  DEFAULT_SCREENING_MAX_CANDIDATES,
  MAX_SCREENING_MAX_CANDIDATES,
} from './constants';
import type {
  CandidateInterviewStage,
  CandidateScreeningMode,
  CandidateScreeningPlatform,
  CreateScreeningRunRequest,
  ExecuteActionsRequest,
  UpdateCandidateProgressRequest,
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

  const maxCandidates =
    body.maxCandidates === undefined ? DEFAULT_SCREENING_MAX_CANDIDATES : body.maxCandidates;
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
