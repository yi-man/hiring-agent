import { z } from 'zod';
import { env } from '@/lib/env';
import { renderManagedPrompt } from '@/lib/prompt-management/registry';
import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
} from './constants';
import { CANDIDATE_SCREENING_EVALUATION_PROMPT_ID } from './prompts';
import type { CandidateTags, EvaluationSchema, ScoreDetail } from './types';

type CandidateEvaluationResponsePayload = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

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

function isUnsupportedJsonObjectError(message: string): boolean {
  return /json_object|response_format|response format/i.test(message);
}

function toCandidateEvaluationResponsePayload(value: unknown): CandidateEvaluationResponsePayload {
  if (!value || typeof value !== 'object') return {};
  return value as CandidateEvaluationResponsePayload;
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

async function parseResponseBody(
  response: Response,
): Promise<{ payload: CandidateEvaluationResponsePayload; rawText: string }> {
  if (typeof response.text !== 'function') {
    const value = (await response.json()) as unknown;
    return {
      payload: toCandidateEvaluationResponsePayload(value),
      rawText: JSON.stringify(value),
    };
  }

  const rawText = await response.text();
  try {
    return {
      payload: toCandidateEvaluationResponsePayload(JSON.parse(rawText) as unknown),
      rawText,
    };
  } catch {
    return { payload: {}, rawText };
  }
}

async function postCandidateEvaluationChat(
  params: {
    jobTitle: string;
    evaluationSchema: EvaluationSchema;
    resumeText: string;
    candidateName: string;
  },
  includeJsonObjectFormat: boolean,
  signal: AbortSignal,
): Promise<{ response: Response; payload: CandidateEvaluationResponsePayload; rawText: string }> {
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
  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: renderedPrompt.options.temperature,
      ...(includeJsonObjectFormat ? { response_format: { type: 'json_object' } } : {}),
      messages: renderedPrompt.messages,
    }),
    signal,
  });
  const { payload, rawText } = await parseResponseBody(response);
  return { response, payload, rawText };
}

export async function runCandidateEvaluationLLM(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
}): Promise<CandidateEvaluationLlmOutput> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.JD_LLM_TIMEOUT_MS);

  try {
    let { response, payload, rawText } = await postCandidateEvaluationChat(
      params,
      env.OPENAI_JSON_MODE,
      controller.signal,
    );

    if (
      !response.ok &&
      env.OPENAI_JSON_MODE &&
      isUnsupportedJsonObjectError(payload.error?.message ?? rawText)
    ) {
      ({ response, payload, rawText } = await postCandidateEvaluationChat(
        params,
        false,
        controller.signal,
      ));
    }

    if (!response.ok) {
      throw new Error(
        payload.error?.message || rawText || `Candidate evaluation HTTP ${response.status}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Candidate evaluation returned empty content');

    return parseCandidateEvaluationContent(content);
  } finally {
    clearTimeout(timeout);
  }
}
