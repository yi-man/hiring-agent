import { env } from '@/lib/env';
import type { EvaluationResult, JD } from '@/types';
import { evaluationJsonSchema, extractJsonObject, jdJsonSchema } from './json-schemas';

type ChatMessage = { role: 'system' | 'user'; content: string };
type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
type OpenAiRequestMeta = { url: string; headers: Record<string, string>; payload: object };
type OpenAiResponseMeta = { status: number; body: OpenAIChatResponse };
type OpenAiCallMeta = { request: OpenAiRequestMeta; response: OpenAiResponseMeta };

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

const MAX_ATTEMPTS = 2;

function isUnsupportedJsonObjectError(message: string): boolean {
  return /json_object|response_format|response format/i.test(message);
}

async function postChatOnce(
  messages: ChatMessage[],
  includeJsonObjectFormat: boolean,
): Promise<{ ok: boolean; status: number; data: OpenAIChatResponse; meta: OpenAiCallMeta }> {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.JD_LLM_TIMEOUT_MS);

  const requestHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  const requestPayload = {
    model: env.OPENAI_MODEL,
    messages,
    temperature: 0.4,
    ...(includeJsonObjectFormat ? { response_format: { type: 'json_object' } } : {}),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    const data = (await res.json()) as OpenAIChatResponse;
    return {
      ok: res.ok,
      status: res.status,
      data,
      meta: {
        request: { url, headers: requestHeaders, payload: requestPayload },
        response: { status: res.status, body: data },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toUsage(usage?: OpenAIChatResponse['usage']): TokenUsage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

async function postChat(
  messages: ChatMessage[],
): Promise<{ content: string; usage: TokenUsage; meta: OpenAiCallMeta }> {
  const includeJson = env.OPENAI_JSON_MODE;
  let { ok, data, meta } = await postChatOnce(messages, includeJson);

  if (!ok && includeJson && isUnsupportedJsonObjectError(data.error?.message ?? '')) {
    ({ ok, data, meta } = await postChatOnce(messages, false));
  }

  if (!ok) {
    const providerError = Object.assign(new Error(data.error?.message || `LLM HTTP error`), {
      status: meta.response.status,
      code: data.error?.message ? undefined : `http_${meta.response.status}`,
      type: 'provider_error',
      body: data,
      response: {
        status: meta.response.status,
        body: data,
      },
      meta,
      llmMeta: meta,
    });
    throw providerError;
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error('Empty LLM response');
  }
  return { content, usage: toUsage(data.usage), meta };
}

async function completeJson<T>(
  messages: ChatMessage[],
  parse: (json: unknown) => T,
): Promise<{ output: T; usage: TokenUsage; meta: OpenAiCallMeta }> {
  let lastError: Error | null = null;
  let accumulated: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let latestMeta: OpenAiCallMeta | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { content, usage, meta } = await postChat(messages);
      latestMeta = meta;
      accumulated = addUsage(accumulated, usage);
      const jsonText = extractJsonObject(content);
      const parsed = JSON.parse(jsonText) as unknown;
      return { output: parse(parsed), usage: accumulated, meta };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (latestMeta) {
    Object.assign(lastError ?? {}, { llmMeta: latestMeta });
  }
  throw lastError ?? new Error('LLM JSON parse failed');
}

export async function openaiGenerateJD(
  system: string,
  user: string,
): Promise<{ output: JD; usage: TokenUsage; meta: OpenAiCallMeta }> {
  return completeJson(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    (v) => jdJsonSchema.parse(v),
  );
}

export async function openaiEvaluateJD(
  system: string,
  user: string,
): Promise<{ output: EvaluationResult; usage: TokenUsage; meta: OpenAiCallMeta }> {
  return completeJson(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    (v) => evaluationJsonSchema.parse(v),
  );
}

export async function openaiImproveJD(
  system: string,
  user: string,
): Promise<{ output: JD; usage: TokenUsage; meta: OpenAiCallMeta }> {
  return openaiGenerateJD(system, user);
}
