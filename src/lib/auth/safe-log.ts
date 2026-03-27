const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[-_]?key)/i;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:token|secret|access_token|refresh_token|id_token|oauth|code|client_secret|session_token)=)[^&]*/gi;
const BEARER_PATTERN = /(Bearer\s+)[^\s]+/gi;
const BASIC_PATTERN = /(Basic\s+)[A-Za-z0-9+/=]+/gi;

function redactString(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PATTERN, `$1${REDACTED}`)
    .replace(BEARER_PATTERN, `$1${REDACTED}`)
    .replace(BASIC_PATTERN, `$1${REDACTED}`);
}

function sanitizeInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInternal(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeInternal(entry, seen);
    }
    return sanitized;
  }

  return value;
}

export function sanitizeAuthLogValue(value: unknown): unknown {
  return sanitizeInternal(value, new WeakSet());
}

export function logSanitizedAuthError(code: string, ...metadata: unknown[]): void {
  console.error(
    '[next-auth][error]',
    code,
    ...metadata.map((entry) => sanitizeAuthLogValue(entry)),
  );
}
