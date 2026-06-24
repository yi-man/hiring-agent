import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const ALGORITHM = 'pbkdf2_sha256';
const ITERATIONS = 600_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `${ALGORITHM}$${ITERATIONS}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4) {
    return false;
  }

  const [algorithm, iterationsRaw, salt, hash] = parts;
  const iterations = Number(iterationsRaw);
  if (
    algorithm !== ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations !== ITERATIONS ||
    !salt ||
    !hash
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hash, 'base64url');
    if (expected.length !== KEY_LENGTH) {
      return false;
    }

    const actual = await pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
