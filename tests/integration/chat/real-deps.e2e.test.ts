/** @jest-environment node */
import { execFileSync } from 'child_process';
import { createClient } from 'redis';
import { createPool } from 'mysql2/promise';
import { requireIntegrationEnv } from './test-env';
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

async function ensureSchema() {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    const dbName = url.pathname.replace(/^\//, '');
    const adminPool = createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      connectionLimit: 1,
    });
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await adminPool.end();
  } else {
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

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
}

describe('chat integration with real deps', () => {
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasRedis = Boolean(process.env.REDIS_URL);
  const hasMysqlUrl = Boolean(env.MYSQL_URL || process.env.DATABASE_URL);
  const hasMysqlParts = Boolean(
    process.env.MYSQL_HOST &&
    process.env.MYSQL_PORT &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_PASS &&
    process.env.MYSQL_DATABASE,
  );
  const shouldRun = hasOpenAi && hasRedis && (hasMysqlUrl || hasMysqlParts);
  const itIfEnv = shouldRun ? it : it.skip;

  beforeAll(async () => {
    if (!shouldRun) {
      return;
    }
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
  });

  async function runTurn(conversationId: string, input: string) {
    await createMessage({ conversationId, role: 'user', content: input });
    const { chunks } = await streamChatReply(conversationId, input);
    let full = '';
    for await (const chunk of chunks) full += chunk;
    await createMessage({ conversationId, role: 'assistant', content: full });
    return full;
  }

  itIfEnv(
    'streams, stores messages, and writes redis history',
    async () => {
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
    },
    120000,
  );

  itIfEnv(
    'keeps histories isolated across conversations',
    async () => {
      const a = await createConversation('iso-user');
      const b = await createConversation('iso-user');
      await runTurn(a.id, '记住暗号A是蓝海');
      await runTurn(b.id, '记住暗号B是星火');
      const aRows = await listMessages(a.id);
      const bRows = await listMessages(b.id);
      expect(aRows.every((m) => m.conversationId === a.id)).toBe(true);
      expect(bRows.every((m) => m.conversationId === b.id)).toBe(true);
      expect(buildHistoryKey(a.id)).not.toBe(buildHistoryKey(b.id));
    },
    120000,
  );

  itIfEnv(
    'uses memory in same conversation for follow-up question',
    async () => {
      const c = await createConversation('memory-user');
      await runTurn(c.id, '记住这个词：晨星计划');
      const second = await runTurn(c.id, '我刚才让你记住的词是什么？');
      expect(second).toContain('晨星');
    },
    120000,
  );

  itIfEnv(
    'rehydrates from mysql after redis inactivity expiration',
    async () => {
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
    },
    120000,
  );

  itIfEnv(
    'keeps personality style and avoids expert identity wording',
    async () => {
      const c = await createConversation('persona-user');
      const reply = await runTurn(c.id, '请介绍你的沟通风格，并先问我一个澄清问题。');
      expect(reply.length).toBeGreaterThan(0);
      expect(reply).not.toMatch(/我[是就是].{0,6}(专家|权威)/);
    },
    120000,
  );

  itIfEnv(
    'orders conversations by latest lastActiveAt after new messages',
    async () => {
      const older = await createConversation('sort-user');
      const newer = await createConversation('sort-user');
      await runTurn(older.id, '让这个会话变成最新活跃');
      const list = await listConversationsPaginated({ limit: 20, offset: 0 });
      const olderIndex = list.findIndex((c) => c.id === older.id);
      const newerIndex = list.findIndex((c) => c.id === newer.id);
      expect(olderIndex).toBeGreaterThanOrEqual(0);
      expect(newerIndex).toBeGreaterThanOrEqual(0);
      expect(olderIndex).toBeLessThan(newerIndex);
    },
    120000,
  );
});
