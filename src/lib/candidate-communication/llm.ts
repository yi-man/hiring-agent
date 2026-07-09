import { env } from '@/lib/env';
import { invokeLlmChat } from '@/lib/llm/openai-chat';
import { renderManagedPrompt } from '@/lib/prompt-management/app-registry';
import { CANDIDATE_COMMUNICATION_PROMPT_ID } from './prompts';
import type { CandidateCommunicationLlmInput } from './decision';
import type { CandidateCommunicationDecision } from './types';

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

async function invokeCandidateCommunicationChat(
  input: CandidateCommunicationLlmInput,
): Promise<string> {
  const renderedPrompt = await renderManagedPrompt(CANDIDATE_COMMUNICATION_PROMPT_ID, {
    payload: JSON.stringify({
      currentStage: input.currentStage,
      ruleIntent: input.ruleIntent,
      ruleIntentLevel: input.ruleIntentLevel,
      candidate: input.candidate,
      job: input.job,
      recentHistory: input.history.slice(-10),
      message: input.message,
    }),
  });
  const response = await invokeLlmChat({
    operation: CANDIDATE_COMMUNICATION_PROMPT_ID,
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

export async function runCandidateCommunicationLLM(
  input: CandidateCommunicationLlmInput,
): Promise<CandidateCommunicationDecision> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const content = await invokeCandidateCommunicationChat(input);
  if (!content) throw new Error('Candidate communication returned empty content');
  return parseCandidateCommunicationDecisionContent(content);
}
