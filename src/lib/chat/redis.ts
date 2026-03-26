import { createClient, type RedisClientType } from 'redis';
import { env } from '@/lib/env';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({ url: env.REDIS_URL });
    redisClient.on('error', (error) => {
      console.error('Redis client error', error);
    });
  }
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }
}
