import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { recordLlmCallEnd, recordLlmCallStart } from '@/lib/llm-observability/log-service';
import type {
  LlmChatMessage,
  LlmChatResult,
  LlmPromptRef,
  LlmProviderAttemptMeta,
  LlmProviderCallMeta,
  LlmResponseFormat,
  LlmTokenUsage,
} from './types';

export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
export const LLM_PROVIDER_CONFIGURATION_ERROR_CODE = 'LLM_PROVIDER_CONFIGURATION' as const;

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type ParsedResponseBody = {
  payload: OpenAIChatResponse;
  rawText: string;
  bodyForMeta: unknown;
};

export type InvokeLlmChatInput = {
  operation: string;
  messages: LlmChatMessage[];
  prompt?: LlmPromptRef;
  metadata?: Record<string, unknown>;
  model?: string;
  temperature?: number;
  responseFormat?: LlmResponseFormat;
  timeoutMs?: number;
};

type ProviderAttemptResult = {
  ok: boolean;
  status: number;
  parsed: ParsedResponseBody;
  meta: LlmProviderCallMeta;
};

type ProviderCallCompatibilityFallback = NonNullable<
  LlmProviderAttemptMeta['compatibilityFallback']
>;

type ProviderCallResult =
  | {
      attempt: ProviderAttemptResult;
      payload: object;
      compatibilityFallback?: ProviderCallCompatibilityFallback;
    }
  | {
      error: Error & { meta?: LlmProviderCallMeta; llmMeta?: LlmProviderCallMeta };
      payload: object;
      compatibilityFallback?: ProviderCallCompatibilityFallback;
    };

export type LlmProviderId = 'openai' | 'deepseek' | 'doubao';

export type LlmProviderConfig = {
  id: LlmProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  jsonMode: boolean;
};

type CircuitBreakerState = {
  failures: number;
  openedUntil: number;
};

type LlmConfigurationError = Error & {
  code: typeof LLM_PROVIDER_CONFIGURATION_ERROR_CODE;
};

const SUPPORTED_PROVIDER_IDS = new Set<LlmProviderId>(['openai', 'deepseek', 'doubao']);
const providerCircuitBreakers = new Map<LlmProviderId, CircuitBreakerState>();

export function getOpenAiChatCompletionsEndpoint(): string {
  return `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
}

export function resetLlmProviderCircuitBreakers(): void {
  providerCircuitBreakers.clear();
}

function createLlmConfigurationError(message: string): LlmConfigurationError {
  return Object.assign(new Error(message), {
    name: 'LlmConfigurationError',
    code: LLM_PROVIDER_CONFIGURATION_ERROR_CODE,
  });
}

function createMissingProviderConfigurationError(
  providerOrder: LlmProviderId[],
): LlmConfigurationError {
  if (providerOrder.length === 1 && providerOrder[0] === 'openai') {
    return createLlmConfigurationError('OPENAI_API_KEY is not configured');
  }
  return createLlmConfigurationError('No configured LLM providers in LLM_PROVIDER_ORDER');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function getChatCompletionsEndpoint(provider: LlmProviderConfig): string {
  return `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`;
}

function parseProviderOrder(rawOrder?: string): LlmProviderId[] {
  const order = (rawOrder || 'openai')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is LlmProviderId => SUPPORTED_PROVIDER_IDS.has(item as LlmProviderId));
  const deduped: LlmProviderId[] = [];

  for (const providerId of order.length ? order : ['openai' as const]) {
    if (!deduped.includes(providerId)) {
      deduped.push(providerId);
    }
  }

  return deduped;
}

function getProviderConfig(
  providerId: LlmProviderId,
  modelOverride?: string,
): LlmProviderConfig | null {
  if (providerId === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      id: 'openai',
      apiKey,
      baseUrl: env.OPENAI_BASE_URL,
      model: modelOverride || env.OPENAI_MODEL || DEFAULT_LLM_MODEL,
      jsonMode: env.OPENAI_JSON_MODE === true,
    };
  }

  if (providerId === 'deepseek') {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      id: 'deepseek',
      apiKey,
      baseUrl: env.DEEPSEEK_BASE_URL,
      model: modelOverride || env.DEEPSEEK_MODEL || 'deepseek-chat',
      jsonMode: env.OPENAI_JSON_MODE === true,
    };
  }

  const apiKey = env.DOUBAO_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    id: 'doubao',
    apiKey,
    baseUrl: env.DOUBAO_BASE_URL,
    model: modelOverride || env.DOUBAO_MODEL || env.OPENAI_MODEL || DEFAULT_LLM_MODEL,
    jsonMode: env.OPENAI_JSON_MODE === true,
  };
}

export function getConfiguredLlmProviders(modelOverride?: string): LlmProviderConfig[] {
  const providerOrder = parseProviderOrder(env.LLM_PROVIDER_ORDER);
  const providers = providerOrder
    .map((providerId) => getProviderConfig(providerId, modelOverride))
    .filter((provider): provider is LlmProviderConfig => provider !== null);

  if (!providers.length) {
    throw createMissingProviderConfigurationError(providerOrder);
  }

  return providers;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  const authKey = Object.keys(sanitized).find((key) => key.toLowerCase() === 'authorization');
  if (authKey) {
    sanitized[authKey] = 'Bearer ***';
  }
  return sanitized;
}

function redactText(value: string): string {
  return `[redacted:${value.length} chars]`;
}

function redactMessagesForLog(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    if (!message || typeof message !== 'object') {
      return message;
    }
    const candidate = message as { content?: unknown };
    if (typeof candidate.content !== 'string') {
      return message;
    }
    return {
      ...candidate,
      content: redactText(candidate.content),
    };
  });
}

function redactProviderPayloadForLog(payload: object): object {
  const candidate = payload as { messages?: unknown };
  return {
    ...payload,
    ...(candidate.messages === undefined
      ? {}
      : { messages: redactMessagesForLog(candidate.messages) }),
  };
}

function redactResponsePayloadForLog(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const candidate = payload as OpenAIChatResponse;
  if (!Array.isArray(candidate.choices)) {
    return payload;
  }

  return {
    ...candidate,
    choices: candidate.choices.map((choice) => {
      const content = choice.message?.content;
      if (typeof content !== 'string') {
        return choice;
      }
      return {
        ...choice,
        message: {
          ...choice.message,
          content: redactText(content),
        },
      };
    }),
  };
}

function isUnsupportedJsonObjectError(message: string): boolean {
  return /json_object|response_format|response format/i.test(message);
}

function toUsage(usage?: OpenAIChatResponse['usage']): LlmTokenUsage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function toOpenAiPayload(value: unknown): OpenAIChatResponse {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as OpenAIChatResponse;
}

async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  if (typeof response.text === 'function') {
    const rawText = await response.text();
    try {
      const parsed = JSON.parse(rawText) as unknown;
      return { payload: toOpenAiPayload(parsed), rawText, bodyForMeta: parsed };
    } catch {
      return { payload: {}, rawText, bodyForMeta: { raw: rawText } };
    }
  }

  const parsed = typeof response.json === 'function' ? ((await response.json()) as unknown) : {};
  return { payload: toOpenAiPayload(parsed), rawText: JSON.stringify(parsed), bodyForMeta: parsed };
}

function buildProviderPayload(input: {
  model: string;
  messages: LlmChatMessage[];
  temperature?: number;
  responseFormat?: LlmResponseFormat;
  includeJsonObjectFormat: boolean;
}): object {
  return {
    model: input.model,
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.responseFormat === 'json_object' && input.includeJsonObjectFormat
      ? { response_format: { type: 'json_object' } }
      : {}),
    messages: input.messages,
  };
}

function buildObservedRequestPayload(
  input: InvokeLlmChatInput,
  providerPayload: object,
  providerAttempts: LlmProviderAttemptMeta[],
): object {
  return {
    operation: input.operation,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    providerRequest: redactProviderPayloadForLog(providerPayload),
    ...(providerAttempts.length ? { providerAttempts } : {}),
  };
}

async function postChatCompletion(params: {
  apiKey: string;
  url: string;
  payload: object;
  timeoutMs: number;
}): Promise<ProviderAttemptResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.apiKey}`,
  };

  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params.payload),
      signal: controller.signal,
    });
    const parsed = await parseResponseBody(response);
    return {
      ok: response.ok,
      status: response.status,
      parsed,
      meta: {
        request: {
          url: params.url,
          headers: sanitizeHeaders(headers),
          payload: redactProviderPayloadForLog(params.payload),
        },
        response: {
          status: response.status,
          body: redactResponsePayloadForLog(parsed.bodyForMeta),
        },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {
    status?: number;
    statusCode?: number;
    name?: string;
    code?: string;
    message?: string;
  };
  if (isRetryableStatus(candidate.status ?? candidate.statusCode)) {
    return true;
  }
  const name = candidate.name?.toLowerCase() ?? '';
  const code = candidate.code?.toLowerCase() ?? '';
  const message = candidate.message?.toLowerCase() ?? '';
  return (
    name === 'aborterror' ||
    code === 'etimedout' ||
    code === 'econnreset' ||
    code === 'econnrefused' ||
    code === 'connectionrefused' ||
    code === 'enotfound' ||
    code === 'eai_again' ||
    message.includes('unable to connect') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
}

function createTransportError(
  error: unknown,
  provider: LlmProviderConfig,
  payload: object,
): Error & {
  meta: LlmProviderCallMeta;
  llmMeta: LlmProviderCallMeta;
} {
  const cause = error instanceof Error ? error : new Error(String(error));
  const meta: LlmProviderCallMeta = {
    request: {
      url: getChatCompletionsEndpoint(provider),
      headers: sanitizeHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      }),
      payload: redactProviderPayloadForLog(payload),
    },
    response: {
      status: 0,
      body: { error: cause.message },
    },
  };
  return Object.assign(new Error(cause.message), {
    name: cause.name,
    code: (cause as { code?: string }).code,
    meta,
    llmMeta: meta,
  });
}

function getErrorMeta(error: unknown): LlmProviderCallMeta | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = error as { llmMeta?: LlmProviderCallMeta; meta?: LlmProviderCallMeta };
  return candidate.llmMeta ?? candidate.meta;
}

async function callProviderWithJsonFallback(params: {
  provider: LlmProviderConfig;
  payload: object;
  input: InvokeLlmChatInput;
  timeoutMs: number;
  onProviderCall(payload: object): void;
}): Promise<ProviderCallResult> {
  const url = getChatCompletionsEndpoint(params.provider);

  async function post(payload: object): Promise<ProviderCallResult> {
    params.onProviderCall(payload);
    try {
      return {
        attempt: await postChatCompletion({
          apiKey: params.provider.apiKey,
          url,
          payload,
          timeoutMs: params.timeoutMs,
        }),
        payload,
      };
    } catch (error) {
      return {
        error: createTransportError(error, params.provider, payload),
        payload,
      };
    }
  }

  const first = await post(params.payload);
  if ('error' in first) {
    return first;
  }

  if (
    !first.attempt.ok &&
    params.input.responseFormat === 'json_object' &&
    params.provider.jsonMode === true &&
    isUnsupportedJsonObjectError(
      first.attempt.parsed.payload.error?.message ?? first.attempt.parsed.rawText,
    )
  ) {
    const fallbackResult = await post(
      buildProviderPayload({
        model: params.provider.model,
        messages: params.input.messages,
        temperature: params.input.temperature,
        responseFormat: params.input.responseFormat,
        includeJsonObjectFormat: false,
      }),
    );
    return {
      ...fallbackResult,
      compatibilityFallback: 'json_object_unsupported',
    };
  }

  return first;
}

function isCircuitOpen(providerId: LlmProviderId, now: number): boolean {
  const state = providerCircuitBreakers.get(providerId);
  if (!state?.openedUntil) {
    return false;
  }
  if (state.openedUntil <= now) {
    providerCircuitBreakers.delete(providerId);
    return false;
  }
  return true;
}

function recordProviderSuccess(providerId: LlmProviderId): void {
  providerCircuitBreakers.delete(providerId);
}

function recordProviderFailure(providerId: LlmProviderId, now: number): void {
  const current = providerCircuitBreakers.get(providerId) ?? { failures: 0, openedUntil: 0 };
  const failures = current.failures + 1;
  const openedUntil =
    failures >= env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD
      ? now + env.LLM_CIRCUIT_BREAKER_COOLDOWN_MS
      : current.openedUntil;
  providerCircuitBreakers.set(providerId, { failures, openedUntil });
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createProviderError(attempt: ProviderAttemptResult): Error & {
  status?: number;
  response?: { status: number; body: unknown };
  body?: unknown;
  meta?: LlmProviderCallMeta;
  llmMeta?: LlmProviderCallMeta;
} {
  const error = Object.assign(
    new Error(
      attempt.parsed.payload.error?.message ||
        attempt.parsed.rawText ||
        `LLM HTTP error (${attempt.status})`,
    ),
    {
      status: attempt.status,
      response: { status: attempt.status, body: attempt.parsed.bodyForMeta },
      body: attempt.parsed.bodyForMeta,
      meta: attempt.meta,
      llmMeta: attempt.meta,
    },
  );
  return error;
}

async function safeRecordEnd(
  context: ReturnType<typeof recordLlmCallStart>,
  result: Parameters<typeof recordLlmCallEnd>[1],
): Promise<void> {
  try {
    await recordLlmCallEnd(context, result);
  } catch {
    // Observability is best-effort and cannot block business flow.
  }
}

export async function invokeLlmChat(input: InvokeLlmChatInput): Promise<LlmChatResult> {
  const providers = getConfiguredLlmProviders(input.model);
  const firstProvider = providers[0];
  if (!firstProvider) {
    throw createLlmConfigurationError('No configured LLM providers in LLM_PROVIDER_ORDER');
  }
  const providerAttempts: LlmProviderAttemptMeta[] = [];
  const timeoutMs = input.timeoutMs ?? env.JD_LLM_TIMEOUT_MS;
  const maxRetries = Math.max(0, env.LLM_MAX_RETRIES);
  let providerPayload = buildProviderPayload({
    model: firstProvider.model,
    messages: input.messages,
    temperature: input.temperature,
    responseFormat: input.responseFormat,
    includeJsonObjectFormat:
      input.responseFormat === 'json_object' && firstProvider.jsonMode === true,
  });
  let totalProviderCalls = 0;
  let lastError: unknown;
  let finalErrorRecorded = false;
  const firstEndpoint = getChatCompletionsEndpoint(firstProvider);

  const start = recordLlmCallStart({
    callId: randomUUID(),
    traceId: randomUUID(),
    requestId: randomUUID(),
    endpoint: firstEndpoint,
    provider: firstProvider.id,
    model: firstProvider.model,
    requestHeaders: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ***',
    },
    requestPayload: buildObservedRequestPayload(input, providerPayload, providerAttempts),
    retryCount: 0,
    timestamp: new Date(),
  });

  function updateObservedStart(provider: LlmProviderConfig, payload: object): void {
    start.endpoint = getChatCompletionsEndpoint(provider);
    start.provider = provider.id;
    start.model = provider.model;
    start.requestPayload = buildObservedRequestPayload(input, payload, providerAttempts);
    start.retryCount = Math.max(0, totalProviderCalls - 1);
  }

  async function recordFinalError(error: unknown): Promise<void> {
    finalErrorRecorded = true;
    const meta = getErrorMeta(error);
    await safeRecordEnd(start, {
      timestamp: new Date(),
      error,
      httpStatus: meta?.response.status,
      responsePayload:
        meta?.response.body === undefined
          ? undefined
          : redactResponsePayloadForLog(meta.response.body),
      finalOutcome: 'error',
    });
  }

  try {
    for (const provider of providers) {
      const endpoint = getChatCompletionsEndpoint(provider);
      if (isCircuitOpen(provider.id, Date.now())) {
        providerAttempts.push({
          provider: provider.id,
          model: provider.model,
          endpoint,
          outcome: 'skipped',
          error: 'circuit_open',
        });
        start.requestPayload = buildObservedRequestPayload(
          input,
          providerPayload,
          providerAttempts,
        );
        continue;
      }

      for (let retryIndex = 0; retryIndex <= maxRetries; retryIndex += 1) {
        const includeJsonObjectFormat =
          input.responseFormat === 'json_object' && provider.jsonMode === true;
        providerPayload = buildProviderPayload({
          model: provider.model,
          messages: input.messages,
          temperature: input.temperature,
          responseFormat: input.responseFormat,
          includeJsonObjectFormat,
        });

        const callResult = await callProviderWithJsonFallback({
          provider,
          payload: providerPayload,
          input,
          timeoutMs,
          onProviderCall: (payload) => {
            totalProviderCalls += 1;
            updateObservedStart(provider, payload);
          },
        });
        providerPayload = callResult.payload;

        if ('error' in callResult) {
          lastError = callResult.error;
          providerAttempts.push({
            provider: provider.id,
            model: provider.model,
            endpoint,
            status: getErrorMeta(callResult.error)?.response.status,
            outcome: 'error',
            error: callResult.error.message,
            ...(callResult.compatibilityFallback
              ? { compatibilityFallback: callResult.compatibilityFallback }
              : {}),
          });
          start.requestPayload = buildObservedRequestPayload(
            input,
            providerPayload,
            providerAttempts,
          );

          if (isRetryableError(callResult.error)) {
            if (retryIndex < maxRetries) {
              await sleep(env.LLM_RETRY_BACKOFF_MS);
              continue;
            }
            recordProviderFailure(provider.id, Date.now());
            break;
          }

          await recordFinalError(callResult.error);
          throw callResult.error;
        }

        const attempt = callResult.attempt;
        if (!attempt.ok) {
          const error = createProviderError(attempt);
          lastError = error;
          providerAttempts.push({
            provider: provider.id,
            model: provider.model,
            endpoint,
            status: attempt.status,
            outcome: 'error',
            error: error.message,
            ...(callResult.compatibilityFallback
              ? { compatibilityFallback: callResult.compatibilityFallback }
              : {}),
          });
          start.requestPayload = buildObservedRequestPayload(
            input,
            providerPayload,
            providerAttempts,
          );

          if (isRetryableError(error)) {
            if (retryIndex < maxRetries) {
              await sleep(env.LLM_RETRY_BACKOFF_MS);
              continue;
            }
            recordProviderFailure(provider.id, Date.now());
            break;
          }

          await recordFinalError(error);
          throw error;
        }

        const content = attempt.parsed.payload.choices?.[0]?.message?.content;
        if (!content?.trim()) {
          const error = Object.assign(new Error('Empty LLM response'), {
            status: attempt.status,
            response: { status: attempt.status, body: attempt.parsed.bodyForMeta },
            body: attempt.parsed.bodyForMeta,
            meta: attempt.meta,
            llmMeta: attempt.meta,
          });
          lastError = error;
          providerAttempts.push({
            provider: provider.id,
            model: provider.model,
            endpoint,
            status: attempt.status,
            outcome: 'error',
            error: error.message,
            ...(callResult.compatibilityFallback
              ? { compatibilityFallback: callResult.compatibilityFallback }
              : {}),
          });
          start.requestPayload = buildObservedRequestPayload(
            input,
            providerPayload,
            providerAttempts,
          );

          if (retryIndex < maxRetries) {
            await sleep(env.LLM_RETRY_BACKOFF_MS);
            continue;
          }
          recordProviderFailure(provider.id, Date.now());
          break;
        }

        recordProviderSuccess(provider.id);
        providerAttempts.push({
          provider: provider.id,
          model: provider.model,
          endpoint,
          status: attempt.status,
          outcome: 'success',
          ...(callResult.compatibilityFallback
            ? { compatibilityFallback: callResult.compatibilityFallback }
            : {}),
        });
        start.requestPayload = buildObservedRequestPayload(
          input,
          providerPayload,
          providerAttempts,
        );
        const usage = toUsage(attempt.parsed.payload.usage);
        await safeRecordEnd(start, {
          timestamp: new Date(),
          responsePayload: redactResponsePayloadForLog(attempt.parsed.bodyForMeta),
          httpStatus: attempt.status,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          finalOutcome: 'success',
        });

        return {
          content,
          provider: provider.id,
          model: provider.model,
          usage,
          meta: attempt.meta,
          attempts: providerAttempts,
        };
      }
    }

    const error =
      lastError instanceof Error
        ? lastError
        : new Error('All configured LLM providers are temporarily unavailable');
    await recordFinalError(error);
    throw error;
  } catch (error) {
    if (finalErrorRecorded) {
      throw error;
    }
    if (error instanceof Error && 'llmMeta' in error) {
      throw error;
    }
    await safeRecordEnd(start, {
      timestamp: new Date(),
      error,
      finalOutcome: 'error',
    });
    throw error;
  }
}
