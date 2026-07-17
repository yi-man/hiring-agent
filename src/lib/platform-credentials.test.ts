import { decryptPlatformPassword, encryptPlatformPassword } from './platform-credentials';

describe('platform credentials', () => {
  const env = {
    NODE_ENV: 'test',
    PLATFORM_CREDENTIALS_ENCRYPTION_KEY: 'unit-test-platform-key',
  } as NodeJS.ProcessEnv;

  it('encrypts passwords with a random authenticated payload', () => {
    const first = encryptPlatformPassword('boss123', env);
    const second = encryptPlatformPassword('boss123', env);

    expect(first).not.toBe(second);
    expect(first).not.toContain('boss123');
    expect(decryptPlatformPassword(first, env)).toBe('boss123');
  });
});
