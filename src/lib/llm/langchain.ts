import { ChatOpenAI } from '@langchain/openai';
import { getConfiguredLlmProviders, type LlmProviderConfig } from './openai-chat';

export type CreateLangChainChatModelOptions = {
  model?: string;
  temperature?: number;
  streaming?: boolean;
};

type LangChainChatModel = ChatOpenAI | ReturnType<ChatOpenAI['withFallbacks']>;

type BindableFallbackModel = ReturnType<ChatOpenAI['withFallbacks']> & {
  bindTools: ChatOpenAI['bindTools'];
  _modelType: ChatOpenAI['_modelType'];
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
): LangChainChatModel {
  const providers = getConfiguredLlmProviders(options.model);
  const models = providers.map((provider) => createChatOpenAiModel(provider, options));
  const primary = models[0];
  if (!primary) {
    throw new Error('No configured LLM providers in LLM_PROVIDER_ORDER');
  }

  const fallbacks = models.slice(1);
  if (!fallbacks.length) {
    return primary;
  }

  return withToolBindingFallbacks(primary, fallbacks);
}

function createChatOpenAiModel(
  provider: LlmProviderConfig,
  options: CreateLangChainChatModelOptions,
): ChatOpenAI {
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

function withToolBindingFallbacks(
  primary: ChatOpenAI,
  fallbacks: ChatOpenAI[],
): BindableFallbackModel {
  const models = [primary, ...fallbacks];
  const fallbackModel = primary.withFallbacks({ fallbacks }) as BindableFallbackModel;

  fallbackModel.bindTools = ((tools, kwargs) => {
    const [boundPrimary, ...boundFallbacks] = models.map((model) => model.bindTools(tools, kwargs));
    return boundPrimary.withFallbacks({ fallbacks: boundFallbacks });
  }) as ChatOpenAI['bindTools'];
  fallbackModel._modelType = primary._modelType.bind(primary) as ChatOpenAI['_modelType'];

  return fallbackModel;
}
