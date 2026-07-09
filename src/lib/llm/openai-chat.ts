import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { recordLlmCallEnd, recordLlmCallStart } from '@/lib/llm-observability/log-service';
import type {
  LlmChatMessage,
  LlmChatResult,
  LlmPromptRef,
  LlmProviderCallMeta,
  LlmResponseFormat,
  LlmTokenUsage,
} from './types';

export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';

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

function getConfiguredModel(model?: string): string {
  return model || env.OPENAI_MODEL || DEFAULT_LLM_MODEL;
}

export function getOpenAiChatCompletionsEndpoint(): string {
  return `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
}

function assertOpenAiConfigured(): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return apiKey;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  const authKey = Object.keys(sanitized).find((key) => key.toLowerCase() === 'authorization');
  if (authKey) {
    sanitized[authKey] = 'Bearer ***';
  }
  return sanitized;
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
          payload: params.payload,
        },
        response: {
          status: response.status,
          body: parsed.bodyForMeta,
        },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
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
  const apiKey = assertOpenAiConfigured();
  const model = getConfiguredModel(input.model);
  const url = getOpenAiChatCompletionsEndpoint();
  const includeJsonObjectFormat =
    input.responseFormat === 'json_object' && env.OPENAI_JSON_MODE === true;
  const timeoutMs = input.timeoutMs ?? env.JD_LLM_TIMEOUT_MS;
  let retryCount = 0;
  let providerPayload = buildProviderPayload({
    model,
    messages: input.messages,
    temperature: input.temperature,
    responseFormat: input.responseFormat,
    includeJsonObjectFormat,
  });

  const start = recordLlmCallStart({
    callId: randomUUID(),
    traceId: randomUUID(),
    requestId: randomUUID(),
    endpoint: url,
    provider: 'openai',
    model,
    requestHeaders: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ***',
    },
    requestPayload: {
      operation: input.operation,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      providerRequest: providerPayload,
    },
    retryCount,
    timestamp: new Date(),
  });

  try {
    let attempt = await postChatCompletion({
      apiKey,
      url,
      payload: providerPayload,
      timeoutMs,
    });

    if (
      !attempt.ok &&
      includeJsonObjectFormat &&
      isUnsupportedJsonObjectError(attempt.parsed.payload.error?.message ?? attempt.parsed.rawText)
    ) {
      retryCount = 1;
      start.retryCount = retryCount;
      providerPayload = buildProviderPayload({
        model,
        messages: input.messages,
        temperature: input.temperature,
        responseFormat: input.responseFormat,
        includeJsonObjectFormat: false,
      });
      start.requestPayload = {
        operation: input.operation,
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        providerRequest: providerPayload,
      };
      attempt = await postChatCompletion({
        apiKey,
        url,
        payload: providerPayload,
        timeoutMs,
      });
    }

    if (!attempt.ok) {
      const error = createProviderError(attempt);
      await safeRecordEnd(start, {
        timestamp: new Date(),
        error,
        httpStatus: attempt.status,
        responsePayload: attempt.parsed.bodyForMeta,
        finalOutcome: 'error',
      });
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
      await safeRecordEnd(start, {
        timestamp: new Date(),
        error,
        httpStatus: attempt.status,
        responsePayload: attempt.parsed.bodyForMeta,
        finalOutcome: 'error',
      });
      throw error;
    }

    const usage = toUsage(attempt.parsed.payload.usage);
    await safeRecordEnd(start, {
      timestamp: new Date(),
      responsePayload: attempt.parsed.bodyForMeta,
      httpStatus: attempt.status,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      finalOutcome: 'success',
    });

    return {
      content,
      model,
      usage,
      meta: attempt.meta,
    };
  } catch (error) {
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
