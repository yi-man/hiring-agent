import { z } from 'zod';
import { env } from '@/lib/env';
import { invokeLlmChat } from '@/lib/llm/openai-chat';
import { renderManagedPrompt } from '@/lib/prompt-management/registry';
import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
} from './constants';
import { CANDIDATE_SCREENING_EVALUATION_PROMPT_ID } from './prompts';
import type { CandidateTags, EvaluationSchema, ScoreDetail } from './types';

const scoreComponentSchema = z.number().finite().min(0).max(100);
const llmBonusComponentSchema = z.number().finite();

const tagListSchema = z.array(z.string()).default([]);

const candidateTagsSchema = z.object({
  skills: tagListSchema,
  domainKnowledge: tagListSchema,
  generalAbility: tagListSchema,
  risk: tagListSchema,
  activity: tagListSchema,
  custom: tagListSchema,
});

const candidateEvaluationSchema = z.object({
  tags: candidateTagsSchema,
  score: z.object({
    skill: scoreComponentSchema,
    domain: scoreComponentSchema,
    ability: scoreComponentSchema,
    risk: scoreComponentSchema,
    llmBonus: llmBonusComponentSchema.default(0),
  }),
  reason: z.string(),
});

export type CandidateEvaluationLlmOutput = {
  tags: CandidateTags;
  score: Omit<ScoreDetail, 'total'>;
  reason: string;
};

export function parseCandidateEvaluationOutput(value: unknown): CandidateEvaluationLlmOutput {
  return candidateEvaluationSchema.parse(value);
}

function extractCompleteJsonObject(content: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseCandidateEvaluationContent(content: string): CandidateEvaluationLlmOutput {
  const trimmed = content.trim();
  try {
    return parseCandidateEvaluationOutput(JSON.parse(trimmed) as unknown);
  } catch (strictParseError) {
    for (let start = trimmed.indexOf('{'); start !== -1; start = trimmed.indexOf('{', start + 1)) {
      const jsonObject = extractCompleteJsonObject(trimmed, start);
      if (!jsonObject) {
        continue;
      }

      try {
        return parseCandidateEvaluationOutput(JSON.parse(jsonObject) as unknown);
      } catch {
        continue;
      }
    }

    throw strictParseError;
  }
}

async function invokeCandidateEvaluationChat(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
}): Promise<string> {
  const promptPayload = JSON.stringify({
    jobTitle: params.jobTitle,
    promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
    scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
    calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
    qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
    evaluationSchema: params.evaluationSchema,
    candidateName: params.candidateName,
    resumeText: params.resumeText.slice(0, 12000),
  });
  const renderedPrompt = await renderManagedPrompt(CANDIDATE_SCREENING_EVALUATION_PROMPT_ID, {
    payload: promptPayload,
  });
  const response = await invokeLlmChat({
    operation: CANDIDATE_SCREENING_EVALUATION_PROMPT_ID,
    prompt: {
      id: renderedPrompt.definition.id,
      version: renderedPrompt.definition.version,
    },
    messages: renderedPrompt.messages,
    temperature: renderedPrompt.options.temperature,
    responseFormat: renderedPrompt.options.responseFormat,
  });
  return response.content;
}

export async function runCandidateEvaluationLLM(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
}): Promise<CandidateEvaluationLlmOutput> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const content = await invokeCandidateEvaluationChat(params);
  if (!content) throw new Error('Candidate evaluation returned empty content');
  return parseCandidateEvaluationContent(content);
}
