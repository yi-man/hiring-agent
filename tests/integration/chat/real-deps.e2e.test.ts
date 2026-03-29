/** @jest-environment node */
import { createClient } from 'redis';
import {
  requireIntegrationEnv,
  ensureIntegrationSchema,
  assertMysqlReachable,
  assertRedisReachable,
} from './test-env';
import { env } from '@/lib/env';
import { buildHistoryKey } from '@/lib/chat/history/redis-chat-history';
import {
  createConversation,
  listConversationsPaginated,
} from '@/lib/chat/repositories/conversation-repo';
import { createMessage, listMessages } from '@/lib/chat/repositories/message-repo';
import { streamChatReply } from '@/lib/chat/chain';
import { closeRedisClient } from '@/lib/chat/redis';
import { RedisChatMessageHistory } from '@/lib/chat/history/redis-chat-history';

/**
 * Fork PRs and repos without Actions secrets have no OPENAI_API_KEY; skipping avoids a hard fail.
 * Local and same-repo CI with the secret still run the full suite.
 */
const skipChatLlmIntegration =
  process.env.GITHUB_ACTIONS === 'true' && !process.env.OPENAI_API_KEY?.trim();
const describeChatWithRealLlm = skipChatLlmIntegration ? describe.skip : describe;

describeChatWithRealLlm('chat integration with real deps', () => {
  beforeAll(async () => {
    requireIntegrationEnv('OPENAI_API_KEY');
    requireIntegrationEnv('MYSQL_HOST');
    requireIntegrationEnv('MYSQL_PORT');
    requireIntegrationEnv('MYSQL_USER');
    requireIntegrationEnv('MYSQL_PASS');
    requireIntegrationEnv('MYSQL_DATABASE');
    requireIntegrationEnv('REDIS_URL');
    await ensureIntegrationSchema();
    await assertMysqlReachable();
    await assertRedisReachable();
  }, 30000);

  afterAll(async () => {
    await closeRedisClient();
  });

  async function runTurn(conversationId: string, input: string) {
    await createMessage({ conversationId, role: 'user', content: input });
    const { chunks } = await streamChatReply(conversationId, input);
    let full = '';
    for await (const chunk of chunks) full += chunk;
    await createMessage({ conversationId, role: 'assistant', content: full });
    return full;
  }

  it('streams, stores messages, and writes redis history', async () => {
    const redis = createClient({ url: env.REDIS_URL });
    await redis.connect();

    const conversation = await createConversation(null);
    const full = await runTurn(conversation.id, '请用一句话介绍你自己，并向我反问一个问题。');

    expect(full.length).toBeGreaterThan(0);
    expect(full).not.toContain('专家');

    const rows = await listMessages(conversation.id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].role).toBe('user');

    const key = buildHistoryKey(conversation.id);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);

    await redis.quit();
  }, 120000);

  it('keeps histories isolated across conversations', async () => {
    const a = await createConversation(null);
    const b = await createConversation(null);
    await runTurn(a.id, '记住暗号A是蓝海');
    await runTurn(b.id, '记住暗号B是星火');
    const aRows = await listMessages(a.id);
    const bRows = await listMessages(b.id);
    expect(aRows.every((m) => m.conversationId === a.id)).toBe(true);
    expect(bRows.every((m) => m.conversationId === b.id)).toBe(true);
    expect(buildHistoryKey(a.id)).not.toBe(buildHistoryKey(b.id));
  }, 120000);

  it('uses memory in same conversation for follow-up question', async () => {
    const c = await createConversation(null);
    await runTurn(c.id, '记住这个词：晨星计划');
    const second = await runTurn(c.id, '我刚才让你记住的词是什么？');
    expect(second).toContain('晨星');
  }, 120000);

  it('rehydrates from mysql after redis inactivity expiration', async () => {
    const redis = createClient({ url: env.REDIS_URL });
    await redis.connect();
    const c = await createConversation(null);
    await runTurn(c.id, '请记住：过期回源测试');
    const key = buildHistoryKey(c.id);
    await redis.expire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await redis.exists(key)).toBe(0);

    const history = new RedisChatMessageHistory(c.id, 60);
    await history.rehydrateFromMySql();
    const messages = await history.getMessages();
    expect(messages.length).toBeGreaterThan(0);
    expect(await redis.exists(key)).toBe(1);
    await redis.quit();
  }, 120000);

  it('keeps personality style and avoids expert identity wording', async () => {
    const c = await createConversation(null);
    const reply = await runTurn(c.id, '请介绍你的沟通风格，并先问我一个澄清问题。');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).not.toMatch(/我[是就是].{0,6}(专家|权威)/);
  }, 120000);

  it('orders conversations by latest lastActiveAt after new messages', async () => {
    const older = await createConversation(null);
    const newer = await createConversation(null);
    await runTurn(older.id, '让这个会话变成最新活跃');
    const list = await listConversationsPaginated({ limit: 20, offset: 0 });
    const olderIndex = list.findIndex((c) => c.id === older.id);
    const newerIndex = list.findIndex((c) => c.id === newer.id);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeLessThan(newerIndex);
  }, 120000);
});
