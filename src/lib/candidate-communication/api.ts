import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type CandidateMessagePayload = {
  jobDescriptionId: string;
  candidateId: string;
  platform: CandidateScreeningPlatform;
  message: {
    content: string;
    externalMessageId?: string | null;
    receivedAt: Date;
  };
  executeReply: boolean;
};

export type UnreadSyncPayload = {
  jobDescriptionId?: string;
  platform: CandidateScreeningPlatform;
  maxPasses?: number;
};

export type CandidateCommunicationRunPayload =
  | {
      mode: 'batch';
      jobDescriptionId?: string;
      platform: CandidateScreeningPlatform;
      maxPasses?: number;
    }
  | {
      mode: 'single';
      jobDescriptionId: string;
      candidateId: string;
      sourceScreeningRunId?: string;
      platform: CandidateScreeningPlatform;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isCandidatePlatform(value: unknown): value is CandidateScreeningPlatform {
  return value === 'boss-like';
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parseOptionalDate(value: unknown): ValidationResult<Date> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: new Date() };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'message.receivedAt is invalid' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'message.receivedAt is invalid' };
  }
  return { ok: true, value: date };
}

export function parseCandidateMessagePayload(
  body: unknown,
): ValidationResult<CandidateMessagePayload> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const jobDescriptionId = cleanText(body.jobDescriptionId);
  if (!jobDescriptionId) {
    return { ok: false, error: 'jobDescriptionId is required' };
  }

  const candidateId = cleanText(body.candidateId);
  if (!candidateId) {
    return { ok: false, error: 'candidateId is required' };
  }

  if (!isCandidatePlatform(body.platform)) {
    return { ok: false, error: 'platform is invalid' };
  }

  if (!isRecord(body.message)) {
    return { ok: false, error: 'message is required' };
  }

  const content = cleanText(body.message.content);
  if (!content) {
    return { ok: false, error: 'message.content is required' };
  }

  const receivedAt = parseOptionalDate(body.message.receivedAt);
  if (!receivedAt.ok) {
    return receivedAt;
  }

  const externalMessageId = cleanText(body.message.externalMessageId);

  return {
    ok: true,
    value: {
      jobDescriptionId,
      candidateId,
      platform: body.platform,
      message: {
        content,
        externalMessageId: externalMessageId || null,
        receivedAt: receivedAt.value,
      },
      executeReply: typeof body.executeReply === 'boolean' ? body.executeReply : true,
    },
  };
}

export function parseUnreadSyncPayload(body: unknown): ValidationResult<UnreadSyncPayload> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const jobDescriptionId = cleanText(body.jobDescriptionId);

  if (!isCandidatePlatform(body.platform)) {
    return { ok: false, error: 'platform is invalid' };
  }

  if (body.maxPasses !== undefined && !isIntegerInRange(body.maxPasses, 1, 20)) {
    return { ok: false, error: 'maxPasses must be between 1 and 20' };
  }

  return {
    ok: true,
    value: {
      platform: body.platform,
      ...(jobDescriptionId ? { jobDescriptionId } : {}),
      ...(body.maxPasses !== undefined ? { maxPasses: body.maxPasses } : {}),
    },
  };
}

export function parseCandidateCommunicationRunPayload(
  body: unknown,
): ValidationResult<CandidateCommunicationRunPayload> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  if (body.mode !== 'batch' && body.mode !== 'single') {
    return { ok: false, error: 'mode is invalid' };
  }

  if (!isCandidatePlatform(body.platform)) {
    return { ok: false, error: 'platform is invalid' };
  }

  const jobDescriptionId = cleanText(body.jobDescriptionId);

  if (body.mode === 'batch') {
    if (body.maxPasses !== undefined && !isIntegerInRange(body.maxPasses, 1, 20)) {
      return { ok: false, error: 'maxPasses must be between 1 and 20' };
    }
    return {
      ok: true,
      value: {
        mode: 'batch',
        platform: body.platform,
        ...(jobDescriptionId ? { jobDescriptionId } : {}),
        ...(body.maxPasses !== undefined ? { maxPasses: body.maxPasses } : {}),
      },
    };
  }

  if (!jobDescriptionId) {
    return { ok: false, error: 'jobDescriptionId is required' };
  }

  const candidateId = cleanText(body.candidateId);
  if (!candidateId) {
    return { ok: false, error: 'candidateId is required' };
  }
  const sourceScreeningRunId = cleanText(body.sourceScreeningRunId);

  return {
    ok: true,
    value: {
      mode: 'single',
      jobDescriptionId,
      candidateId,
      ...(sourceScreeningRunId ? { sourceScreeningRunId } : {}),
      platform: body.platform,
    },
  };
}
