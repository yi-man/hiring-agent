import { LLM_PROVIDER_CONFIGURATION_ERROR_CODE, invokeLlmChat } from '@/lib/llm';
import { renderManagedPrompt } from '@/lib/prompts/app-registry';
import type { EvaluationResult, JD, JobSchema } from '@/types';
import { mockEvaluateJD, mockGenerateJD, mockImproveJD } from './llm.mock';
import { evaluationJsonSchema, extractJsonObject, jdJsonSchema } from './json-schemas';
import {
  buildEvaluatePromptVariables,
  buildGeneratePromptVariables,
  buildImprovePromptVariables,
  JD_EVALUATE_PROMPT_ID,
  JD_GENERATE_PROMPT_ID,
  JD_IMPROVE_PROMPT_ID,
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

const MAX_JSON_ATTEMPTS = 2;

export function shouldUseMockLlm(): boolean {
  return process.env.NODE_ENV === 'test';
}

function addUsage(a: LLMCallResult['usage'], b: LLMCallResult['usage']): LLMCallResult['usage'] {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function isGatewayError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown };
  return (
    'status' in error ||
    'response' in error ||
    'llmMeta' in error ||
    candidate.code === LLM_PROVIDER_CONFIGURATION_ERROR_CODE
  );
}

async function runManagedJsonPrompt<T>(input: {
  promptId: string;
  variables: Record<string, unknown>;
  parse: (value: unknown) => T;
}): Promise<{ model: string; output: T; usage: LLMCallResult['usage'] }> {
  const rendered = await renderManagedPrompt(input.promptId, input.variables);
  let lastError: Error | null = null;
  let model = 'unknown';
  let usage: LLMCallResult['usage'] = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt += 1) {
    try {
      const result = await invokeLlmChat({
        operation: input.promptId,
        prompt: {
          id: rendered.definition.id,
          version: rendered.definition.version,
        },
        messages: rendered.messages,
        temperature: rendered.options.temperature,
        responseFormat: rendered.options.responseFormat,
        metadata: { attempt },
      });
      model = result.model;
      usage = addUsage(usage, result.usage);
      const parsed = JSON.parse(extractJsonObject(result.content)) as unknown;
      return {
        model,
        output: input.parse(parsed),
        usage,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isGatewayError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('LLM JSON parse failed');
}

export async function runLLM(input: LLMCallInput): Promise<LLMCallResult> {
  if (shouldUseMockLlm()) {
    return runMockLlm(input);
  }

  if (input.stage === 'generate') {
    return runManagedJsonPrompt({
      promptId: JD_GENERATE_PROMPT_ID,
      variables: buildGeneratePromptVariables(input.schema, input.companyContext),
      parse: (value) => jdJsonSchema.parse(value),
    });
  }

  if (input.stage === 'evaluate') {
    return runManagedJsonPrompt({
      promptId: JD_EVALUATE_PROMPT_ID,
      variables: buildEvaluatePromptVariables(input.jd, input.companyContext),
      parse: (value) => evaluationJsonSchema.parse(value),
    });
  }

  return runManagedJsonPrompt({
    promptId: JD_IMPROVE_PROMPT_ID,
    variables: buildImprovePromptVariables(
      input.jd,
      input.evaluation,
      input.extraInstruction,
      input.companyContext,
    ),
    parse: (value) => jdJsonSchema.parse(value),
  });
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
