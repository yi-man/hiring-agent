import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { buildHistoryKey, RedisChatMessageHistory } from '@/lib/chat/history/redis-chat-history';

const redisStore = new Map<string, string>();
const redisMock = {
  get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  }),
  del: jest.fn(async (key: string) => {
    redisStore.delete(key);
    return 1;
  }),
};

jest.mock('@/lib/chat/redis', () => ({
  getRedisClient: async () => redisMock,
}));

jest.mock('@/lib/chat/repositories/message-repo', () => ({
  listMessages: jest.fn(async () => []),
}));

describe('RedisChatMessageHistory', () => {
  beforeEach(() => {
    redisStore.clear();
    redisMock.get.mockClear();
    redisMock.set.mockClear();
    redisMock.del.mockClear();
  });

  it('builds key by conversationId', () => {
    expect(buildHistoryKey('abc')).toBe('chat:history:abc');
  });

  it('serializes and appends messages with ttl', async () => {
    const history = new RedisChatMessageHistory('c1', 123);
    await history.addMessages([new HumanMessage('u1')]);
    await history.addMessages([new AIMessage('a1')]);
    const messages = await history.getMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('u1');
    expect(messages[1].content).toBe('a1');
    expect(redisMock.set).toHaveBeenLastCalledWith('chat:history:c1', expect.any(String), {
      EX: 123,
    });
  });

  it('supports clear/read operations', async () => {
    const history = new RedisChatMessageHistory('c2');
    await history.addUserMessage('hello');
    expect((await history.getMessages()).length).toBe(1);
    await history.clear();
    expect(await history.getMessages()).toEqual([]);
    expect(redisMock.del).toHaveBeenCalledWith('chat:history:c2');
  });
});
