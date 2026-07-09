import { ChatOpenAI } from '@langchain/openai';
import { getConfiguredLlmProviders, type LlmProviderConfig } from './openai-chat';

export type CreateLangChainChatModelOptions = {
  model?: string;
  temperature?: number;
  streaming?: boolean;
};

export function getConfiguredLlmProvider(model?: string): LlmProviderConfig {
  const provider = getConfiguredLlmProviders(model)[0];
  if (!provider) {
    throw new Error('No configured LLM providers in LLM_PROVIDER_ORDER');
  }
  return provider;
}

export function getConfiguredLlmModel(model?: string): string {
  return getConfiguredLlmProvider(model).model;
}

export function getConfiguredLlmChatCompletionsEndpoint(model?: string): string {
  const provider = getConfiguredLlmProvider(model);
  return `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
}

export function createLangChainChatModel(
  options: CreateLangChainChatModelOptions = {},
): ChatOpenAI {
  const provider = getConfiguredLlmProvider(options.model);
  return new ChatOpenAI({
    apiKey: provider.apiKey,
    model: provider.model,
    configuration: {
      baseURL: provider.baseUrl,
    },
    temperature: options.temperature,
    streaming: options.streaming,
  });
}
