jest.mock('@/lib/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://example.com/v1',
    OPENAI_MODEL: 'test-model',
    CHAT_REDIS_TTL_SECONDS: 86400,
    CHAT_HISTORY_REHYDRATE_LIMIT: 50,
  },
}));

const rehydrateMock = jest.fn(async () => undefined);
jest.mock('@/lib/chat/history/redis-chat-history', () => ({
  RedisChatMessageHistory: jest.fn().mockImplementation(() => ({
    rehydrateFromMySql: rehydrateMock,
  })),
}));

import { buildSystemPrompt } from '@/lib/chat/prompts';
import { buildChatChain, buildStandaloneMessages } from '@/lib/chat/chain';

describe('chat chain', () => {
  it('system prompt includes required personality and constraints', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('活泼开朗');
    expect(prompt).toContain('聪明敏锐');
    expect(prompt).toContain('主动发问');
    expect(prompt).toContain('不要自称');
  });

  it('builds runnable with message history wiring', async () => {
    const chain = buildChatChain();
    expect(chain).toBeDefined();
    expect(typeof (chain as { stream?: unknown }).stream).toBe('function');
  });

  it('builds standalone system+human messages', () => {
    const messages = buildStandaloneMessages('hello');
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe('hello');
  });
});
