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
    const user = buildGenerateUserPrompt(input.schema);
    const jd = await openaiGenerateJD(GENERATE_SYSTEM_PROMPT, user);
    return { model: env.OPENAI_MODEL, output: jd };
  }

  if (input.stage === 'evaluate') {
    const user = buildEvaluateUserPrompt(input.jd);
    const evaluation = await openaiEvaluateJD(EVALUATE_SYSTEM_PROMPT, user);
    return { model: env.OPENAI_MODEL, output: evaluation };
  }

  const user = buildImproveUserPrompt(input.jd, input.evaluation, input.extraInstruction);
  const jd = await openaiImproveJD(IMPROVE_SYSTEM_PROMPT, user);
  return { model: env.OPENAI_MODEL, output: jd };
}

async function runMockLlm(input: LLMCallInput): Promise<LLMCallResult> {
  if (input.stage === 'generate') {
    return {
      model: 'mock-jd-agent',
      output: mockGenerateJD(input.schema.title),
    };
  }

  if (input.stage === 'evaluate') {
    return {
      model: 'mock-jd-agent',
      output: mockEvaluateJD(input.jd),
    };
  }

  return {
    model: 'mock-jd-agent',
    output: mockImproveJD(input.jd, input.extraInstruction),
  };
}
