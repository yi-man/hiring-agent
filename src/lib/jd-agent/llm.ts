import { env } from '@/lib/env';
import { recordLlmCallEnd, recordLlmCallStart } from '@/lib/llm-observability/log-service';
import type { EvaluationResult, JD, JobSchema } from '@/types';
import { randomUUID } from 'node:crypto';
import { mockEvaluateJD, mockGenerateJD, mockImproveJD } from './llm.mock';
import { openaiEvaluateJD, openaiGenerateJD, openaiImproveJD } from './openai-adapter';
import {
  buildEvaluateUserPrompt,
  buildGenerateUserPrompt,
  buildImproveUserPrompt,
  EVALUATE_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  IMPROVE_SYSTEM_PROMPT,
} from './prompts';

export type LLMCallInput =
  | { stage: 'generate'; schema: JobSchema; companyContext?: string }
  | { stage: 'evaluate'; jd: JD; companyContext?: string }
  | {
      stage: 'improve';
      jd: JD;
      evaluation: EvaluationResult;
      extraInstruction: string;
      companyContext?: string;
    };

export type LLMCallResult = {
  model: string;
  output: JD | EvaluationResult;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

type OpenAiCallResult<T> = {
  output: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  meta: {
    request: { url: string; headers: Record<string, string>; payload: object };
    response: { status: number; body: unknown };
  };
};

type OpenAiMeta = OpenAiCallResult<unknown>['meta'];

type ErrorWithMeta = {
  status?: number;
  response?: { status?: number; body?: unknown; data?: unknown };
  body?: unknown;
  data?: unknown;
  meta?: OpenAiMeta;
  llmMeta?: OpenAiMeta;
};

export function shouldUseMockLlm(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }
  if (env.JD_LLM_MOCK) {
    return true;
  }
  if (!env.OPENAI_API_KEY?.trim()) {
    return true;
  }
  return false;
}

async function safeRecordLlmCallEnd(
  start: ReturnType<typeof recordLlmCallStart>,
  payload: Parameters<typeof recordLlmCallEnd>[1],
): Promise<void> {
  try {
    await recordLlmCallEnd(start, payload);
  } catch {
    // Observability is best-effort and cannot block business flow.
  }
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  const authKey = Object.keys(sanitized).find((key) => key.toLowerCase() === 'authorization');
  if (authKey) {
    sanitized[authKey] = 'Bearer ***';
  }
  return sanitized;
}

function getErrorMeta(error: unknown): {
  httpStatus?: number;
  responsePayload?: unknown;
  meta?: OpenAiMeta;
} {
  if (!error || typeof error !== 'object') {
    return {};
  }
  const e = error as ErrorWithMeta;
  const meta = e.meta ?? e.llmMeta;
  if (meta) {
    return {
      httpStatus: meta.response.status,
      responsePayload: meta.response.body,
      meta,
    };
  }
  return {
    httpStatus: e.response?.status ?? e.status,
    responsePayload: e.response?.body ?? e.response?.data ?? e.body ?? e.data,
  };
}

async function runLoggedOpenAiCall<T>(
  stage: LLMCallInput['stage'],
  requestPayload: object,
  invoke: () => Promise<OpenAiCallResult<T>>,
): Promise<OpenAiCallResult<T>> {
  const start = recordLlmCallStart({
    callId: randomUUID(),
    traceId: randomUUID(),
    requestId: randomUUID(),
    endpoint: `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`,
    provider: 'openai',
    model: env.OPENAI_MODEL,
    requestHeaders: {
      'Content-Type': 'application/json',
      Authorization: env.OPENAI_API_KEY ? 'Bearer ***' : 'Bearer <missing>',
    },
    requestPayload: { stage, ...requestPayload },
    timestamp: new Date(),
  });

  try {
    const result = await invoke();
    const contextForEnd = {
      ...start,
      endpoint: result.meta.request.url || start.endpoint,
      requestHeaders: sanitizeHeaders(result.meta.request.headers),
      requestPayload: result.meta.request.payload,
    };
    await safeRecordLlmCallEnd(contextForEnd, {
      timestamp: new Date(),
      responsePayload: result.meta.response.body,
      httpStatus: result.meta.response.status,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      finalOutcome: 'success',
    });
    return result;
  } catch (error) {
    const metaFromError = getErrorMeta(error);
    const contextForEnd = metaFromError.meta
      ? {
          ...start,
          endpoint: metaFromError.meta.request.url || start.endpoint,
          requestHeaders: sanitizeHeaders(metaFromError.meta.request.headers),
          requestPayload: metaFromError.meta.request.payload,
        }
      : start;
    await safeRecordLlmCallEnd(contextForEnd, {
      timestamp: new Date(),
      error,
      httpStatus: metaFromError.httpStatus,
      responsePayload: metaFromError.responsePayload,
      finalOutcome: 'error',
    });
    throw error;
  }
}

export async function runLLM(input: LLMCallInput): Promise<LLMCallResult> {
  if (shouldUseMockLlm()) {
    return runMockLlm(input);
  }

  if (input.stage === 'generate') {
    const user = await buildGenerateUserPrompt(input.schema, input.companyContext);
    const result = await runLoggedOpenAiCall(
      input.stage,
      {
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: GENERATE_SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      },
      () => openaiGenerateJD(GENERATE_SYSTEM_PROMPT, user),
    );
    return { model: env.OPENAI_MODEL, output: result.output, usage: result.usage };
  }

  if (input.stage === 'evaluate') {
    const user = await buildEvaluateUserPrompt(input.jd, input.companyContext);
    const result = await runLoggedOpenAiCall(
      input.stage,
      {
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: EVALUATE_SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      },
      () => openaiEvaluateJD(EVALUATE_SYSTEM_PROMPT, user),
    );
    return { model: env.OPENAI_MODEL, output: result.output, usage: result.usage };
  }

  const user = await buildImproveUserPrompt(
    input.jd,
    input.evaluation,
    input.extraInstruction,
    input.companyContext,
  );
  const result = await runLoggedOpenAiCall(
    input.stage,
    {
      model: env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: IMPROVE_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    },
    () => openaiImproveJD(IMPROVE_SYSTEM_PROMPT, user),
  );
  return { model: env.OPENAI_MODEL, output: result.output, usage: result.usage };
}

async function runMockLlm(input: LLMCallInput): Promise<LLMCallResult> {
  if (input.stage === 'generate') {
    return {
      model: 'mock-jd-agent',
      output: mockGenerateJD(input.schema.title),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  if (input.stage === 'evaluate') {
    return {
      model: 'mock-jd-agent',
      output: mockEvaluateJD(input.jd),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  return {
    model: 'mock-jd-agent',
    output: mockImproveJD(input.jd, input.extraInstruction),
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}
