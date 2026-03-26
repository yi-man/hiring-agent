import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  type MessageType,
} from '@langchain/core/messages';
import { env } from '@/lib/env';
import { getRedisClient } from '@/lib/chat/redis';
import { listMessages } from '@/lib/chat/repositories/message-repo';

type StoredHistoryMessage = {
  type: MessageType;
  content: string;
};

function toStored(msg: BaseMessage): StoredHistoryMessage {
  return { type: msg.getType(), content: msg.text };
}

function toLangChain(msg: StoredHistoryMessage): BaseMessage {
  if (msg.type === 'ai') return new AIMessage(msg.content);
  if (msg.type === 'system') return new SystemMessage(msg.content);
  return new HumanMessage(msg.content);
}

export function buildHistoryKey(conversationId: string): string {
  return `chat:history:${conversationId}`;
}

export class RedisChatMessageHistory extends BaseChatMessageHistory {
  constructor(
    private readonly conversationId: string,
    private readonly ttlSeconds = env.CHAT_REDIS_TTL_SECONDS,
  ) {
    super();
  }

  async getMessages(): Promise<BaseMessage[]> {
    const redis = await getRedisClient();
    const raw = await redis.get(buildHistoryKey(this.conversationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredHistoryMessage[];
    return parsed.map(toLangChain);
  }

  async addMessages(messages: BaseMessage[]): Promise<void> {
    if (!messages.length) return;
    const redis = await getRedisClient();
    const key = buildHistoryKey(this.conversationId);
    const currentRaw = await redis.get(key);
    const current = currentRaw ? (JSON.parse(currentRaw) as StoredHistoryMessage[]) : [];
    current.push(...messages.map(toStored));
    await redis.set(key, JSON.stringify(current), { EX: this.ttlSeconds });
  }

  async clear(): Promise<void> {
    const redis = await getRedisClient();
    await redis.del(buildHistoryKey(this.conversationId));
  }

  addMessage(message: BaseMessage): Promise<void> {
    return this.addMessages([message]);
  }

  addUserMessage(message: string): Promise<void> {
    return this.addMessages([new HumanMessage(message)]);
  }

  addAIMessage(message: string): Promise<void> {
    return this.addMessages([new AIMessage(message)]);
  }

  lc_namespace = ['chat', 'redis-history'];

  async rehydrateFromMySql(limit = env.CHAT_HISTORY_REHYDRATE_LIMIT): Promise<void> {
    const existing = await this.getMessages();
    if (existing.length) return;
    const rows = await listMessages(this.conversationId, limit);
    const mapped: BaseMessage[] = rows.map((row) => {
      if (row.role === 'assistant') return new AIMessage(row.content);
      if (row.role === 'system') return new SystemMessage(row.content);
      return new HumanMessage(row.content);
    });
    await this.addMessages(mapped);
  }
}
