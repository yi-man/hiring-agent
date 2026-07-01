import { env } from '@/lib/env';
import type { CandidateCommunicationLlmInput } from './decision';
import type { CandidateCommunicationDecision } from './types';

type CommunicationLlmResponsePayload = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const SYSTEM_PROMPT = `You are a recruiting communication agent. Your goal is to continue useful conversation, collect resumes when evidence is missing, and convert qualified/interested candidates to private contact when appropriate.

Return only valid JSON with this exact contract:
{
  "intent": "greeting|resume_shared|salary_question|job_question|contact_shared|not_interested|unknown",
  "intentLevel": "high|medium|low",
  "nextStage": "new|screening|waiting_resume|resume_received|evaluating|contact_requested|contact_exchanged|rejected|closed",
  "shouldReply": true,
  "reply": "short Chinese reply or null",
  "actions": ["reply"],
  "rationale": "short reason"
}

Rules:
- If ruleIntent is contact_shared, nextStage must be contact_exchanged and do not ask for contact again.
- If ruleIntent is not_interested, nextStage must be rejected.
- If no resume/profile evidence is available, ask for resume before asking for private contact.
- Answers should also advance the hiring goal: answer briefly, then ask for resume or contact.
- Keep replies concise, natural, and non-spammy.`;

function isUnsupportedJsonObjectError(message: string): boolean {
  return /json_object|response_format|response format/i.test(message);
}

function toPayload(value: unknown): CommunicationLlmResponsePayload {
  if (!value || typeof value !== 'object') return {};
  return value as CommunicationLlmResponsePayload;
}

async function parseResponseBody(
  response: Response,
): Promise<{ payload: CommunicationLlmResponsePayload; rawText: string }> {
  const rawText = await response.text();
  try {
    return { payload: toPayload(JSON.parse(rawText) as unknown), rawText };
  } catch {
    return { payload: {}, rawText };
  }
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

function parseCandidateCommunicationDecisionContent(
  content: string,
): CandidateCommunicationDecision {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as CandidateCommunicationDecision;
  } catch (strictParseError) {
    for (let start = trimmed.indexOf('{'); start !== -1; start = trimmed.indexOf('{', start + 1)) {
      const jsonObject = extractCompleteJsonObject(trimmed, start);
      if (!jsonObject) {
        continue;
      }

      try {
        return JSON.parse(jsonObject) as CandidateCommunicationDecision;
      } catch {
        continue;
      }
    }

    throw strictParseError;
  }
}

async function postCommunicationChat(
  input: CandidateCommunicationLlmInput,
  includeJsonObjectFormat: boolean,
  signal: AbortSignal,
): Promise<{ response: Response; payload: CommunicationLlmResponsePayload; rawText: string }> {
  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      ...(includeJsonObjectFormat ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            currentStage: input.currentStage,
            ruleIntent: input.ruleIntent,
            ruleIntentLevel: input.ruleIntentLevel,
            candidate: input.candidate,
            job: input.job,
            recentHistory: input.history.slice(-10),
            message: input.message,
          }),
        },
      ],
    }),
    signal,
  });
  const { payload, rawText } = await parseResponseBody(response);
  return { response, payload, rawText };
}

export async function runCandidateCommunicationLLM(
  input: CandidateCommunicationLlmInput,
): Promise<CandidateCommunicationDecision> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.JD_LLM_TIMEOUT_MS);

  try {
    let { response, payload, rawText } = await postCommunicationChat(
      input,
      env.OPENAI_JSON_MODE,
      controller.signal,
    );

    if (
      !response.ok &&
      env.OPENAI_JSON_MODE &&
      isUnsupportedJsonObjectError(payload.error?.message ?? rawText)
    ) {
      ({ response, payload, rawText } = await postCommunicationChat(
        input,
        false,
        controller.signal,
      ));
    }

    if (!response.ok) {
      throw new Error(
        payload.error?.message || rawText || `Candidate communication HTTP ${response.status}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Candidate communication returned empty content');
    return parseCandidateCommunicationDecisionContent(content);
  } finally {
    clearTimeout(timeout);
  }
}
