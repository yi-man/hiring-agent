import { ChatOpenAI } from '@langchain/openai';
import { env } from '@/lib/env';
import { DEFAULT_LLM_MODEL } from './openai-chat';

export type CreateLangChainChatModelOptions = {
  model?: string;
  temperature?: number;
  streaming?: boolean;
};

function getOpenAiApiKey(): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return apiKey;
}

export function getConfiguredLlmModel(model?: string): string {
  return model || env.OPENAI_MODEL || DEFAULT_LLM_MODEL;
}

export function createLangChainChatModel(
  options: CreateLangChainChatModelOptions = {},
): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: getOpenAiApiKey(),
    model: getConfiguredLlmModel(options.model),
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
    temperature: options.temperature,
    streaming: options.streaming,
  });
}
