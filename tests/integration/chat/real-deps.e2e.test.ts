/** @jest-environment node */
import { createClient } from 'redis';
import { createPool, type Pool } from 'mysql2/promise';
import { env } from '@/lib/env';
import { buildHistoryKey } from '@/lib/chat/history/redis-chat-history';
import { createConversation } from '@/lib/chat/repositories/conversation-repo';
import { createMessage, listMessages } from '@/lib/chat/repositories/message-repo';
import { streamChatReply } from '@/lib/chat/chain';
import { closeMySqlPool } from '@/lib/chat/mysql';
import { closeRedisClient } from '@/lib/chat/redis';
import { RedisChatMessageHistory } from '@/lib/chat/history/redis-chat-history';
import { requireIntegrationEnv } from './test-env';

function createIntegrationPool(): Pool {
  if (env.MYSQL_URL) {
    return createPool({ uri: env.MYSQL_URL, connectionLimit: 2 });
  }
  return createPool({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASS,
    database: env.MYSQL_DATABASE,
    connectionLimit: 2,
  });
}

async function ensureSchema() {
  if (!env.MYSQL_URL) {
    const adminPool = createPool({
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASS,
      connectionLimit: 1,
    });
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${env.MYSQL_DATABASE}\``);
    await adminPool.end();
  }
  const pool = createIntegrationPool();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(128) NULL,
      title VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL,
      last_active_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(36) PRIMARY KEY,
      conversation_id VARCHAR(36) NOT NULL,
      role VARCHAR(16) NOT NULL,
      content LONGTEXT NOT NULL,
      seq INT NOT NULL,
      token_count INT NULL,
      created_at DATETIME(3) NOT NULL,
      INDEX idx_messages_conversation_seq (conversation_id, seq)
    )
  `);
  await pool.end();
}

describe('chat integration with real deps', () => {
  beforeAll(async () => {
    requireIntegrationEnv('OPENAI_API_KEY');
    if (!env.MYSQL_URL) {
      requireIntegrationEnv('MYSQL_HOST');
      requireIntegrationEnv('MYSQL_PORT');
      requireIntegrationEnv('MYSQL_USER');
      requireIntegrationEnv('MYSQL_PASS');
      requireIntegrationEnv('MYSQL_DATABASE');
    }
    requireIntegrationEnv('REDIS_URL');
    await ensureSchema();
  }, 30000);

  afterAll(async () => {
    await closeRedisClient();
    await closeMySqlPool();
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

    const conversation = await createConversation('integration-test-user');
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
    const a = await createConversation('iso-user');
    const b = await createConversation('iso-user');
    await runTurn(a.id, '记住暗号A是蓝海');
    await runTurn(b.id, '记住暗号B是星火');
    const aRows = await listMessages(a.id);
    const bRows = await listMessages(b.id);
    expect(aRows.every((m) => m.conversationId === a.id)).toBe(true);
    expect(bRows.every((m) => m.conversationId === b.id)).toBe(true);
    expect(buildHistoryKey(a.id)).not.toBe(buildHistoryKey(b.id));
  }, 120000);

  it('uses memory in same conversation for follow-up question', async () => {
    const c = await createConversation('memory-user');
    await runTurn(c.id, '记住这个词：晨星计划');
    const second = await runTurn(c.id, '我刚才让你记住的词是什么？');
    expect(second).toContain('晨星');
  }, 120000);

  it('rehydrates from mysql after redis inactivity expiration', async () => {
    const redis = createClient({ url: env.REDIS_URL });
    await redis.connect();
    const c = await createConversation('ttl-user');
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
    const c = await createConversation('persona-user');
    const reply = await runTurn(c.id, '请介绍你的沟通风格，并先问我一个澄清问题。');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).not.toMatch(/我[是就是].{0,6}(专家|权威)/);
  }, 120000);
});
