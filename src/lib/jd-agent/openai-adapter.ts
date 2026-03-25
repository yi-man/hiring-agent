import { env } from '@/lib/env';
import type { EvaluationResult, JD } from '@/types';
import { evaluationJsonSchema, extractJsonObject, jdJsonSchema } from './json-schemas';

type ChatMessage = { role: 'system' | 'user'; content: string };

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const MAX_ATTEMPTS = 2;

async function postChat(messages: ChatMessage[]): Promise<string> {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.API_TIMEOUT);

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
        ...(env.OPENAI_JSON_MODE ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    const data = (await res.json()) as OpenAIChatResponse;
    if (!res.ok) {
      throw new Error(data.error?.message || `LLM HTTP ${res.status}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      throw new Error('Empty LLM response');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function completeJson<T>(messages: ChatMessage[], parse: (json: unknown) => T): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await postChat(messages);
      const jsonText = extractJsonObject(raw);
      const parsed = JSON.parse(jsonText) as unknown;
      return parse(parsed);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error('LLM JSON parse failed');
}

export async function openaiGenerateJD(system: string, user: string): Promise<JD> {
  return completeJson(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    (v) => jdJsonSchema.parse(v),
  );
}

export async function openaiEvaluateJD(system: string, user: string): Promise<EvaluationResult> {
  return completeJson(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    (v) => evaluationJsonSchema.parse(v),
  );
}

export async function openaiImproveJD(system: string, user: string): Promise<JD> {
  return openaiGenerateJD(system, user);
}
