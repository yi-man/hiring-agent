import { parseEnv } from '@/lib/env';

describe('chat env config', () => {
  it('parses chat persistence defaults', () => {
    const result = parseEnv({});
    expect(result.MYSQL_HOST).toBe('127.0.0.1');
    expect(result.MYSQL_PORT).toBe(3306);
    expect(result.MYSQL_USER).toBe('root');
    expect(result.MYSQL_PASS).toBe('mysql1234');
    expect(result.MYSQL_DATABASE).toBe('bia');
    expect(result.MYSQL_CI_SUFFIX).toBe('_ci');
    expect(result.REDIS_URL).toBe('redis://127.0.0.1:6379');
    expect(result.CHAT_REDIS_TTL_SECONDS).toBe(86400);
    expect(result.CHAT_HISTORY_REHYDRATE_LIMIT).toBe(50);
    expect(result.CHAT_TEST_REDIS_PREFIX).toBe('chat:test');
  });

  it('parses chat persistence overrides', () => {
    const result = parseEnv({
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '3307',
      MYSQL_USER: 'u',
      MYSQL_PASS: 'p',
      MYSQL_DATABASE: 'bia_test',
      MYSQL_CI_SUFFIX: '_itest',
      REDIS_URL: 'redis://127.0.0.1:6380',
      CHAT_REDIS_TTL_SECONDS: '123',
      CHAT_HISTORY_REHYDRATE_LIMIT: '12',
      CHAT_TEST_REDIS_PREFIX: 'chat:ci',
    });
    expect(result.MYSQL_HOST).toBe('127.0.0.1');
    expect(result.MYSQL_PORT).toBe(3307);
    expect(result.MYSQL_USER).toBe('u');
    expect(result.MYSQL_PASS).toBe('p');
    expect(result.MYSQL_DATABASE).toBe('bia_test');
    expect(result.MYSQL_CI_SUFFIX).toBe('_itest');
    expect(result.REDIS_URL).toBe('redis://127.0.0.1:6380');
    expect(result.CHAT_REDIS_TTL_SECONDS).toBe(123);
    expect(result.CHAT_HISTORY_REHYDRATE_LIMIT).toBe(12);
    expect(result.CHAT_TEST_REDIS_PREFIX).toBe('chat:ci');
  });
});
