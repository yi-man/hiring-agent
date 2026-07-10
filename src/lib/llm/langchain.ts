import { ChatOpenAI } from '@langchain/openai';
import { getConfiguredLlmProviders, type LlmProviderConfig } from './openai-chat';

export type CreateLangChainChatModelOptions = {
  model?: string;
  temperature?: number;
  streaming?: boolean;
};

type StructuredOutputArgs = Parameters<ChatOpenAI['withStructuredOutput']>;
type ToolBindingArgs = Parameters<ChatOpenAI['bindTools']>;
type LangChainFallbackModel = ReturnType<ChatOpenAI['withFallbacks']>;
type LangChainStructuredOutput = ReturnType<ChatOpenAI['withStructuredOutput']>;

type PatchedFallbackModel = LangChainFallbackModel & {
  bindTools(tools: ToolBindingArgs[0], kwargs?: ToolBindingArgs[1]): PatchedFallbackModel;
  withStructuredOutput(
    schema: StructuredOutputArgs[0],
    config?: StructuredOutputArgs[1],
  ): LangChainStructuredOutput;
  _modelType: ChatOpenAI['_modelType'];
};

type LangChainChatModel = ChatOpenAI | PatchedFallbackModel;

type FallbackCapableRunnable = {
  withFallbacks(input: { fallbacks: unknown[] }): unknown;
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
): PatchedFallbackModel {
  const models = [primary, ...fallbacks];
  const fallbackModel = primary.withFallbacks({ fallbacks });

  return patchFallbackModel(fallbackModel, primary, models);
}

function patchFallbackModel(
  fallbackModel: LangChainFallbackModel,
  primary: ChatOpenAI,
  models: ChatOpenAI[],
): PatchedFallbackModel {
  const patchedFallbackModel = fallbackModel as PatchedFallbackModel;

  patchedFallbackModel._modelType = primary._modelType.bind(primary) as ChatOpenAI['_modelType'];
  patchedFallbackModel.withStructuredOutput = ((schema, config) => {
    const [structuredPrimary, ...structuredFallbacks] = models.map((model) =>
      model.withStructuredOutput(schema, config),
    );
    return (structuredPrimary as unknown as FallbackCapableRunnable).withFallbacks({
      fallbacks: structuredFallbacks,
    }) as LangChainStructuredOutput;
  }) as PatchedFallbackModel['withStructuredOutput'];

  patchedFallbackModel.bindTools = ((tools, kwargs) => {
    const [boundPrimary, ...boundFallbacks] = models.map((model) => model.bindTools(tools, kwargs));
    const boundFallbackModel = (boundPrimary as unknown as FallbackCapableRunnable).withFallbacks({
      fallbacks: boundFallbacks,
    }) as LangChainFallbackModel;
    return patchFallbackModel(boundFallbackModel, primary, models);
  }) as PatchedFallbackModel['bindTools'];

  return patchedFallbackModel;
}
