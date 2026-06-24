import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

import { hashPassword, verifyPassword } from '@/lib/auth/password';

const pbkdf2Async = promisify(pbkdf2);

describe('password hashing', () => {
  it('verifies the original password and rejects a different password', async () => {
    const encoded = await hashPassword('hiring_2026');

    await expect(verifyPassword('hiring_2026', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
  });

  it('uses a unique salt for each hash', async () => {
    const first = await hashPassword('hiring_2026');
    const second = await hashPassword('hiring_2026');

    expect(first).not.toBe(second);
    expect(first).toMatch(/^pbkdf2_sha256\$/);
    expect(second).toMatch(/^pbkdf2_sha256\$/);
    expect(first.split('$')[1]).toBe('600000');
    expect(second.split('$')[1]).toBe('600000');
  });

  it('rejects malformed hashes without throwing', async () => {
    await expect(verifyPassword('hiring_2026', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(
      verifyPassword('hiring_2026', 'pbkdf2_sha256$210000$salt$hash$extra'),
    ).resolves.toBe(false);
    await expect(verifyPassword('hiring_2026', 'pbkdf2_sha256$0$salt$hash')).resolves.toBe(false);
    await expect(verifyPassword('hiring_2026', 'pbkdf2_sha256$abc$salt$hash')).resolves.toBe(false);
    await expect(verifyPassword('hiring_2026', 'pbkdf2_sha256$210000$salt$')).resolves.toBe(false);
  });

  it('rejects hashes that do not match the current work factor and key length', async () => {
    const password = 'hiring_2026';
    const valid = await hashPassword(password);
    const [algorithm, , salt] = valid.split('$');
    const downgradedHash = await pbkdf2Async(password, salt, 1, 32, 'sha256');
    const shortHash = await pbkdf2Async(password, salt, 600_000, 1, 'sha256');

    await expect(
      verifyPassword(password, `${algorithm}$1$${salt}$${downgradedHash.toString('base64url')}`),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(password, `${algorithm}$600000$${salt}$${shortHash.toString('base64url')}`),
    ).resolves.toBe(false);
  });
});
