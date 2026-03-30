/**
 * Workflow Learning 的 browser_snapshot 工具默认允许所有域名。
 *
 * 如果你想重新启用安全限制（仅允许 localhost/127.0.0.1 + 应用源站域名），
 * 可设置：
 * - `WORKFLOW_TOOL_URL_ALLOWLIST_MODE=allowlisted`
 *
 * 注意：仍要求输入是完整的 http(s) URL（带协议），因为上层工具参数使用了 zod URL 校验。
 */
const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

type AllowlistMode = 'all' | 'allowlisted';

function getAllowlistMode(): AllowlistMode {
  const raw = process.env.WORKFLOW_TOOL_URL_ALLOWLIST_MODE?.trim().toLowerCase();
  if (raw === 'allowlisted') return 'allowlisted';
  return 'all';
}

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
 * Throws if the URL is not http(s) URL, or (when in allowlisted mode) not on allowlisted host.
 * Rejects URLs with userinfo (user:pass@).
 */
export function assertUrlAllowed(input: string): URL {
  const mode = getAllowlistMode();
  if (mode === 'allowlisted') {
    addEnvAppHostname();
  }
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
  if (mode === 'allowlisted' && !ALLOWED_HOSTNAMES.has(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }
  return url;
}
