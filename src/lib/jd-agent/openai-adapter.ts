import { env } from '@/lib/env';
import type { EvaluationResult, JD } from '@/types';
import { evaluationJsonSchema, extractJsonObject, jdJsonSchema } from './json-schemas';

type ChatMessage = { role: 'system' | 'user'; content: string };
type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

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
): Promise<{ ok: boolean; status: number; data: OpenAIChatResponse }> {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.JD_LLM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages,
        temperature: 0.4,
        ...(includeJsonObjectFormat ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    const data = (await res.json()) as OpenAIChatResponse;
    return { ok: res.ok, status: res.status, data };
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

async function postChat(messages: ChatMessage[]): Promise<{ content: string; usage: TokenUsage }> {
  const includeJson = env.OPENAI_JSON_MODE;
  let { ok, data } = await postChatOnce(messages, includeJson);

  if (!ok && includeJson && isUnsupportedJsonObjectError(data.error?.message ?? '')) {
    ({ ok, data } = await postChatOnce(messages, false));
  }

  if (!ok) {
    throw new Error(data.error?.message || `LLM HTTP error`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error('Empty LLM response');
  }
  return { content, usage: toUsage(data.usage) };
}

async function completeJson<T>(
  messages: ChatMessage[],
  parse: (json: unknown) => T,
): Promise<{ output: T; usage: TokenUsage }> {
  let lastError: Error | null = null;
  let accumulated: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { content, usage } = await postChat(messages);
      accumulated = addUsage(accumulated, usage);
      const jsonText = extractJsonObject(content);
      const parsed = JSON.parse(jsonText) as unknown;
      return { output: parse(parsed), usage: accumulated };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error('LLM JSON parse failed');
}

export async function openaiGenerateJD(
  system: string,
  user: string,
): Promise<{ output: JD; usage: TokenUsage }> {
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
): Promise<{ output: EvaluationResult; usage: TokenUsage }> {
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
): Promise<{ output: JD; usage: TokenUsage }> {
  return openaiGenerateJD(system, user);
}
