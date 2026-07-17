import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret =
    env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY?.trim() || env.NEXTAUTH_SECRET?.trim() || '';
  if (!secret) {
    throw new Error('PLATFORM_CREDENTIALS_ENCRYPTION_KEY is required to store platform passwords');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptPlatformPassword(password: string, env?: NodeJS.ProcessEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptPlatformPassword(payload: string, env?: NodeJS.ProcessEnv): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('platform password payload is invalid');
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(env), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
