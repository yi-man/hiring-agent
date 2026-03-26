import { env } from '@/lib/env';
import type { EvaluationResult, JD, JobSchema } from '@/types';
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
  | { stage: 'generate'; schema: JobSchema }
  | { stage: 'evaluate'; jd: JD }
  | {
      stage: 'improve';
      jd: JD;
      evaluation: EvaluationResult;
      extraInstruction: string;
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

export async function runLLM(input: LLMCallInput): Promise<LLMCallResult> {
  if (shouldUseMockLlm()) {
    return runMockLlm(input);
  }

  if (input.stage === 'generate') {
    const user = await buildGenerateUserPrompt(input.schema);
    const result = await openaiGenerateJD(GENERATE_SYSTEM_PROMPT, user);
    return { model: env.OPENAI_MODEL, output: result.output, usage: result.usage };
  }

  if (input.stage === 'evaluate') {
    const user = await buildEvaluateUserPrompt(input.jd);
    const result = await openaiEvaluateJD(EVALUATE_SYSTEM_PROMPT, user);
    return { model: env.OPENAI_MODEL, output: result.output, usage: result.usage };
  }

  const user = await buildImproveUserPrompt(input.jd, input.evaluation, input.extraInstruction);
  const result = await openaiImproveJD(IMPROVE_SYSTEM_PROMPT, user);
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
