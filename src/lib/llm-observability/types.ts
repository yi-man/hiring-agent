export const LLM_ERROR_DOMAINS = [
  'transport',
  'provider',
  'application',
  'timeout',
  'rate_limit',
  'auth',
  'unknown',
] as const;

export type LlmErrorDomain = (typeof LLM_ERROR_DOMAINS)[number];

export type ClassifiedLlmError = {
  errorDomain: LlmErrorDomain;
  errorCode: string;
  providerStatus: string | null;
};

export type LlmCallStartContext = {
  callId?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  endpoint: string;
  provider: string;
  model: string;
  requestHeaders: unknown;
  requestPayload: unknown;
  retryCount?: number;
  timestamp: Date;
};

export type LlmCallSuccessResult = {
  timestamp: Date;
  responsePayload?: unknown;
  httpStatus?: number | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  finalOutcome?: string;
};

export type LlmCallErrorResult = {
  timestamp: Date;
  error: unknown;
  responsePayload?: unknown;
  httpStatus?: number | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  finalOutcome?: string;
};

export type LlmCallEndResult = LlmCallSuccessResult | LlmCallErrorResult;
