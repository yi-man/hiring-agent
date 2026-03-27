const OUTAGE_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const OUTAGE_NAME_PATTERNS = ['PrismaClientInitializationError'];
const OUTAGE_MESSAGE_PATTERNS = [
  'can not reach database server',
  "can't reach database server",
  'could not connect to server',
  'connect econnrefused',
  'connect etimedout',
  'getaddrinfo enotfound',
  'name resolution failed',
  'connection refused',
  'connection timed out',
  'timed out while connecting',
];

type ErrorLike = {
  code?: unknown;
  name?: unknown;
  message?: unknown;
  cause?: unknown;
};

function toUpperCode(code: unknown): string | null {
  return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : null;
}

function matchesOutageMessage(message: unknown): boolean {
  if (typeof message !== 'string') {
    return false;
  }
  const normalized = message.toLowerCase();
  return OUTAGE_MESSAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function matchesOutageName(name: unknown): boolean {
  if (typeof name !== 'string') {
    return false;
  }
  return OUTAGE_NAME_PATTERNS.some((pattern) => name.includes(pattern));
}

export function isDependencyOutageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typedError = error as ErrorLike;
  const code = toUpperCode(typedError.code);
  if (code && OUTAGE_ERROR_CODES.has(code)) {
    return true;
  }

  if (matchesOutageName(typedError.name) || matchesOutageMessage(typedError.message)) {
    return true;
  }

  if (typedError.cause && typedError.cause !== error) {
    return isDependencyOutageError(typedError.cause);
  }

  return false;
}

export const DEPENDENCY_OUTAGE_MESSAGE = 'Service temporarily unavailable';
