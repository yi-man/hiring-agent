import { classifyLlmError } from '@/lib/llm-observability/error-classifier';
import {
  persistLlmCallLog,
  PersistLlmCallLogInput,
  upsertLlmUsageStatsDaily,
  UpsertLlmUsageStatsDailyInput,
} from '@/lib/llm-observability/log-repo';
import {
  LlmCallEndResult,
  LlmCallErrorResult,
  LlmCallStartContext,
} from '@/lib/llm-observability/types';

export type { PersistLlmCallLogInput, UpsertLlmUsageStatsDailyInput };
export { persistLlmCallLog, upsertLlmUsageStatsDaily };

const DEFAULT_MAX_PAYLOAD_CHARS = 50_000;
const SENSITIVE_AUDIT_LOG_PREFIX = '[llm-observability:audit]';

export type SensitivePayloadAccessAuditEvent = {
  actor: string;
  action: 'read_log_details' | 'read_raw_payload' | 'read_raw_headers';
  endpoint: string;
  success: boolean;
  reason?: string;
  callId?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  timestamp?: Date;
};

export function recordLlmCallStart(context: LlmCallStartContext): LlmCallStartContext {
  return context;
}

function isErrorResult(resultOrError: LlmCallEndResult): resultOrError is LlmCallErrorResult {
  return 'error' in resultOrError;
}

function toObjectPayload(payload: unknown): object {
  if (payload === null || payload === undefined) {
    return {};
  }
  if (typeof payload === 'object') {
    return payload as object;
  }
  return { raw: String(payload) };
}

function getMaxPayloadChars(): number {
  const raw = process.env.LLM_OBSERVABILITY_MAX_PAYLOAD_CHARS;
  if (!raw) {
    return DEFAULT_MAX_PAYLOAD_CHARS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_PAYLOAD_CHARS;
  }
  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : DEFAULT_MAX_PAYLOAD_CHARS;
}

function truncateIfNeeded(
  value: string,
  maxChars: number,
): { value: string; truncated: boolean; originalSize: number } {
  if (value.length <= maxChars) {
    return { value, truncated: false, originalSize: value.length };
  }
  return { value: value.slice(0, maxChars), truncated: true, originalSize: value.length };
}

function toBoundedPayload(payload: unknown): object {
  const maxChars = getMaxPayloadChars();
  const normalized = toObjectPayload(payload);
  try {
    const serialized = JSON.stringify(normalized);
    if (!serialized) {
      return normalized;
    }
    const bounded = truncateIfNeeded(serialized, maxChars);
    if (!bounded.truncated) {
      return normalized;
    }
    return {
      __truncated: true,
      __encoding: 'json',
      __maxChars: maxChars,
      __originalChars: bounded.originalSize,
      raw: bounded.value,
    };
  } catch {
    const rawValue = String(normalized);
    const bounded = truncateIfNeeded(rawValue, maxChars);
    if (!bounded.truncated) {
      return { raw: rawValue };
    }
    return {
      __truncated: true,
      __encoding: 'string',
      __maxChars: maxChars,
      __originalChars: bounded.originalSize,
      raw: bounded.value,
    };
  }
}

export function recordSensitivePayloadAccess(event: SensitivePayloadAccessAuditEvent): void {
  const timestamp = event.timestamp ?? new Date();
  console.info(
    SENSITIVE_AUDIT_LOG_PREFIX,
    JSON.stringify({
      ...event,
      timestamp: timestamp.toISOString(),
    }),
  );
}

function computeLatencyMs(start: Date, end: Date): number {
  const latency = end.getTime() - start.getTime();
  return latency > 0 ? latency : 0;
}

export async function recordLlmCallEnd(
  context: LlmCallStartContext,
  resultOrError: LlmCallEndResult,
): Promise<void> {
  const isError = isErrorResult(resultOrError);
  const timestamp = resultOrError.timestamp;
  const latencyMs = computeLatencyMs(context.timestamp, timestamp);
  const inputTokens = resultOrError.inputTokens ?? 0;
  const outputTokens = resultOrError.outputTokens ?? 0;
  const totalTokens = resultOrError.totalTokens ?? inputTokens + outputTokens;

  const basePayload: PersistLlmCallLogInput = {
    callId: context.callId ?? null,
    traceId: context.traceId ?? null,
    requestId: context.requestId ?? null,
    endpoint: context.endpoint,
    provider: context.provider,
    model: context.model,
    requestHeaders: toBoundedPayload(context.requestHeaders),
    requestPayload: toBoundedPayload(context.requestPayload),
    responsePayload:
      resultOrError.responsePayload === undefined
        ? null
        : toBoundedPayload(resultOrError.responsePayload),
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs,
    httpStatus: resultOrError.httpStatus ?? null,
    isError,
    retryCount: context.retryCount ?? 0,
    finalOutcome: resultOrError.finalOutcome ?? (isError ? 'error' : 'success'),
    timestamp,
  };

  if (isError) {
    const classification = classifyLlmError(resultOrError.error);
    basePayload.errorDomain = classification.errorDomain;
    basePayload.errorCode = classification.errorCode;
    basePayload.providerStatus = classification.providerStatus;
  }

  try {
    await persistLlmCallLog(basePayload);
  } catch (error) {
    // Logging is best-effort and must not break business flow.
    console.warn('Failed to persist llm call log', error);
  }
}
