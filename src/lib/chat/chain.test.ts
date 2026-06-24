const mockStream = jest.fn();

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn(() => ({
      pipe: jest.fn(() => ({})),
    })),
  },
  MessagesPlaceholder: jest.fn(),
}));

jest.mock('@langchain/core/runnables', () => ({
  RunnableWithMessageHistory: jest.fn().mockImplementation(() => ({
    stream: mockStream,
  })),
}));

jest.mock('@langchain/core/messages', () => ({
  AIMessageChunk: class AIMessageChunk {
    content: unknown;
    constructor(content: unknown) {
      this.content = content;
    }
  },
  HumanMessage: class HumanMessage {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
  SystemMessage: class SystemMessage {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4o-mini',
  },
}));

jest.mock('@/lib/chat/prompts', () => ({
  buildSystemPrompt: jest.fn(() => 'system-prompt'),
}));

jest.mock('@/lib/chat/history/redis-chat-history', () => ({
  RedisChatMessageHistory: jest.fn().mockImplementation(() => ({
    rehydrateFromDatabase: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/lib/llm-observability/log-service', () => ({
  recordLlmCallStart: jest.fn((ctx) => ctx),
  recordLlmCallEnd: jest.fn().mockResolvedValue(undefined),
}));

describe('streamChatReply observability', () => {
  let chainModule: typeof import('@/lib/chat/chain');
  let recordLlmCallEnd: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    mockStream.mockReset();
    chainModule = await import('@/lib/chat/chain');
    ({ recordLlmCallEnd } = jest.requireMock('@/lib/llm-observability/log-service') as {
      recordLlmCallEnd: jest.Mock;
    });
  });

  afterEach(() => {
    recordLlmCallEnd.mockClear();
  });

  it('writes error end-log when stream initialization fails', async () => {
    const initError = new Error('stream init failed');
    mockStream.mockRejectedValueOnce(initError);

    await expect(chainModule.streamChatReply('conv-1', 'hello')).rejects.toThrow(
      'stream init failed',
    );

    expect(recordLlmCallEnd).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEnd).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        error: initError,
        finalOutcome: 'error',
        timestamp: expect.any(Date),
      }),
    );
  });
});
