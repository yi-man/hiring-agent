const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function addEnvAppHostname(): void {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw?.trim()) return;
  try {
    const host = new URL(raw).hostname;
    if (host) ALLOWED_HOSTNAMES.add(host);
  } catch {
    // ignore invalid env
  }
}

/**
 * Throws if the URL is not http(s) to an allowlisted host (localhost, 127.0.0.1, NEXT_PUBLIC_APP_URL host).
 * Rejects URLs with userinfo (user:pass@).
 */
export function assertUrlAllowed(input: string): URL {
  addEnvAppHostname();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed');
  }
  if (!ALLOWED_HOSTNAMES.has(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }
  return url;
}
