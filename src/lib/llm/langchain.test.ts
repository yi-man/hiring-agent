type MockChatModelInstance = {
  options: unknown;
  withFallbacks: jest.Mock;
  bindTools: jest.Mock;
  withStructuredOutput: jest.Mock;
  _modelType: jest.Mock;
};

const mockChatModelInstances: MockChatModelInstance[] = [];

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation((options) => {
    const instance: MockChatModelInstance = {
      options,
      withFallbacks: jest.fn(),
      bindTools: jest.fn(),
      withStructuredOutput: jest.fn(),
      _modelType: jest.fn(() => 'base_chat_model'),
    };
    instance.withFallbacks.mockImplementation(({ fallbacks }) => ({
      type: 'fallback-chain',
      primary: instance,
      fallbacks,
    }));
    instance.bindTools.mockImplementation(() => ({
      type: 'bound-tools',
      source: instance,
      withFallbacks: jest.fn(({ fallbacks }) => ({
        type: 'bound-fallback-chain',
        primary: instance,
        fallbacks,
      })),
    }));
    instance.withStructuredOutput.mockImplementation(() => ({
      type: 'structured-output',
      source: instance,
      withFallbacks: jest.fn(({ fallbacks }) => ({
        type: 'structured-fallback-chain',
        primary: instance,
        fallbacks,
      })),
    }));
    mockChatModelInstances.push(instance);
    return instance;
  }),
}));

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'openai-key',
    OPENAI_BASE_URL: 'https://openai.example/v1',
    OPENAI_MODEL: 'openai-model',
    OPENAI_JSON_MODE: true,
    LLM_PROVIDER_ORDER: 'openai',
    DEEPSEEK_API_KEY: undefined,
    DEEPSEEK_BASE_URL: 'https://deepseek.example/v1',
    DEEPSEEK_MODEL: undefined,
    DOUBAO_API_KEY: undefined,
    DOUBAO_BASE_URL: 'https://doubao.example/api/v3',
    DOUBAO_MODEL: undefined,
  },
}));

import { LLM_PROVIDER_CONFIGURATION_ERROR_CODE, type LlmProviderConfig } from './openai-chat';
import {
  createLangChainChatModel,
  getConfiguredLlmChatCompletionsEndpoint,
  getConfiguredLlmModel,
  getConfiguredLlmProvider,
} from './langchain';

const mockEnv = jest.requireMock('@/lib/env').env as {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_JSON_MODE: boolean;
  LLM_PROVIDER_ORDER: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL: string;
  DEEPSEEK_MODEL?: string;
  DOUBAO_API_KEY?: string;
  DOUBAO_BASE_URL: string;
  DOUBAO_MODEL?: string;
};

const { ChatOpenAI } = jest.requireMock('@langchain/openai') as {
  ChatOpenAI: jest.Mock;
};

describe('LangChain LLM factory', () => {
  beforeEach(() => {
    ChatOpenAI.mockClear();
    mockChatModelInstances.length = 0;
    mockEnv.OPENAI_API_KEY = 'openai-key';
    mockEnv.OPENAI_BASE_URL = 'https://openai.example/v1';
    mockEnv.OPENAI_MODEL = 'openai-model';
    mockEnv.LLM_PROVIDER_ORDER = 'openai';
    mockEnv.DEEPSEEK_API_KEY = undefined;
    mockEnv.DEEPSEEK_BASE_URL = 'https://deepseek.example/v1';
    mockEnv.DEEPSEEK_MODEL = undefined;
    mockEnv.DOUBAO_API_KEY = undefined;
    mockEnv.DOUBAO_BASE_URL = 'https://doubao.example/api/v3';
    mockEnv.DOUBAO_MODEL = undefined;
  });

  it('creates an OpenAI-compatible LangChain model from the centralized provider config', () => {
    createLangChainChatModel({ temperature: 0.3, streaming: true });

    expect(ChatOpenAI).toHaveBeenCalledWith({
      apiKey: 'openai-key',
      model: 'openai-model',
      configuration: { baseURL: 'https://openai.example/v1' },
      temperature: 0.3,
      streaming: true,
    });
  });

  it('uses the first configured non-OpenAI provider in LLM_PROVIDER_ORDER', () => {
    mockEnv.OPENAI_API_KEY = '';
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao,openai';
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';

    createLangChainChatModel();

    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'deepseek-key',
        model: 'deepseek-chat',
        configuration: { baseURL: 'https://deepseek.example/v1' },
      }),
    );
    expect(getConfiguredLlmProvider()).toMatchObject<Partial<LlmProviderConfig>>({
      id: 'deepseek',
      model: 'deepseek-chat',
    });
    expect(getConfiguredLlmModel()).toBe('deepseek-chat');
    expect(getConfiguredLlmChatCompletionsEndpoint()).toBe(
      'https://deepseek.example/v1/chat/completions',
    );
  });

  it('skips unconfigured providers when selecting the LangChain model provider', () => {
    mockEnv.OPENAI_API_KEY = '';
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';

    createLangChainChatModel();

    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'doubao-key',
        model: 'doubao-chat',
        configuration: { baseURL: 'https://doubao.example/api/v3' },
      }),
    );
  });

  it('builds a runtime fallback chain for the remaining configured providers', () => {
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao,openai';
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';

    const model = createLangChainChatModel({ temperature: 0.2, streaming: true });

    expect(ChatOpenAI).toHaveBeenCalledTimes(3);
    expect(mockChatModelInstances[0]?.withFallbacks).toHaveBeenCalledWith({
      fallbacks: [mockChatModelInstances[1], mockChatModelInstances[2]],
    });
    expect(model).toMatchObject({
      type: 'fallback-chain',
      primary: mockChatModelInstances[0],
      fallbacks: [mockChatModelInstances[1], mockChatModelInstances[2]],
    });
    expect((model as { bindTools?: unknown }).bindTools).toEqual(expect.any(Function));
  });

  it('binds tools across every provider in the fallback chain', () => {
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao,openai';
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';
    const tools = [{ name: 'browser_snapshot' }];

    const model = createLangChainChatModel();
    const boundModel = (
      model as {
        bindTools(tools: unknown[], kwargs?: unknown): unknown;
      }
    ).bindTools(tools);

    expect(mockChatModelInstances[0]?.bindTools).toHaveBeenCalledWith(tools, undefined);
    expect(mockChatModelInstances[1]?.bindTools).toHaveBeenCalledWith(tools, undefined);
    expect(mockChatModelInstances[2]?.bindTools).toHaveBeenCalledWith(tools, undefined);
    expect(boundModel).toMatchObject({
      type: 'bound-fallback-chain',
      primary: mockChatModelInstances[0],
      fallbacks: [
        expect.objectContaining({ source: mockChatModelInstances[1] }),
        expect.objectContaining({ source: mockChatModelInstances[2] }),
      ],
    });
    expect((boundModel as { _modelType?: () => string })._modelType?.()).toBe('base_chat_model');
    expect((boundModel as { bindTools?: unknown }).bindTools).toEqual(expect.any(Function));
  });

  it('preserves structured output across every provider in the fallback chain', () => {
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao,openai';
    mockEnv.DEEPSEEK_API_KEY = 'deepseek-key';
    mockEnv.DEEPSEEK_MODEL = 'deepseek-chat';
    mockEnv.DOUBAO_API_KEY = 'doubao-key';
    mockEnv.DOUBAO_MODEL = 'doubao-chat';
    const schema = { type: 'object', properties: { answer: { type: 'string' } } };
    const config = { name: 'Answer' };

    const model = createLangChainChatModel();
    const structuredModel = (
      model as {
        withStructuredOutput(schema: unknown, config?: unknown): unknown;
      }
    ).withStructuredOutput(schema, config);

    expect(mockChatModelInstances[0]?.withStructuredOutput).toHaveBeenCalledWith(schema, config);
    expect(mockChatModelInstances[1]?.withStructuredOutput).toHaveBeenCalledWith(schema, config);
    expect(mockChatModelInstances[2]?.withStructuredOutput).toHaveBeenCalledWith(schema, config);
    expect(structuredModel).toMatchObject({
      type: 'structured-fallback-chain',
      primary: mockChatModelInstances[0],
      fallbacks: [
        expect.objectContaining({ source: mockChatModelInstances[1] }),
        expect.objectContaining({ source: mockChatModelInstances[2] }),
      ],
    });
  });

  it('throws the centralized configuration error when no requested provider is configured', () => {
    mockEnv.OPENAI_API_KEY = '';
    mockEnv.LLM_PROVIDER_ORDER = 'deepseek,doubao';

    let error: unknown;
    try {
      createLangChainChatModel();
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      message: 'No configured LLM providers in LLM_PROVIDER_ORDER',
      code: LLM_PROVIDER_CONFIGURATION_ERROR_CODE,
    });
    expect(ChatOpenAI).not.toHaveBeenCalled();
  });
});
