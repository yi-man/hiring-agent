import { parseEnv } from '@/lib/env';

describe('chat env config', () => {
  it('parses postgres persistence defaults', () => {
    const result = parseEnv({});
    expect(result.POSTGRES_HOST).toBe('127.0.0.1');
    expect(result.POSTGRES_PORT).toBe(5432);
    expect(result.POSTGRES_USER).toBe('apple');
    expect(result.POSTGRES_PASSWORD).toBe('');
    expect(result.POSTGRES_DATABASE).toBe('bia');
    expect(result.POSTGRES_CI_SUFFIX).toBe('_ci');
    expect(result.REDIS_URL).toBe('redis://127.0.0.1:6379');
    expect(result.CHAT_REDIS_TTL_SECONDS).toBe(86400);
    expect(result.CHAT_HISTORY_REHYDRATE_LIMIT).toBe(50);
    expect(result.CHAT_TEST_REDIS_PREFIX).toBe('chat:test');
  });

  it('parses postgres persistence overrides', () => {
    const result = parseEnv({
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '5433',
      POSTGRES_USER: 'u',
      POSTGRES_PASSWORD: 'p',
      POSTGRES_DATABASE: 'bia_test',
      POSTGRES_CI_SUFFIX: '_itest',
      REDIS_URL: 'redis://127.0.0.1:6380',
      CHAT_REDIS_TTL_SECONDS: '123',
      CHAT_HISTORY_REHYDRATE_LIMIT: '12',
      CHAT_TEST_REDIS_PREFIX: 'chat:ci',
    });
    expect(result.POSTGRES_HOST).toBe('127.0.0.1');
    expect(result.POSTGRES_PORT).toBe(5433);
    expect(result.POSTGRES_USER).toBe('u');
    expect(result.POSTGRES_PASSWORD).toBe('p');
    expect(result.POSTGRES_DATABASE).toBe('bia_test');
    expect(result.POSTGRES_CI_SUFFIX).toBe('_itest');
    expect(result.REDIS_URL).toBe('redis://127.0.0.1:6380');
    expect(result.CHAT_REDIS_TTL_SECONDS).toBe(123);
    expect(result.CHAT_HISTORY_REHYDRATE_LIMIT).toBe(12);
    expect(result.CHAT_TEST_REDIS_PREFIX).toBe('chat:ci');
  });
});
