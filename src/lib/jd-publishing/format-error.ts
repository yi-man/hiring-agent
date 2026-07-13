/**
 * Turn raw Playwright / browser-automation errors into short Chinese tips for recruiters.
 * Keeps original text available for debugging when needed.
 */

const ANSI_ESCAPE_RE = /\u001b\[[0-9;]*m/g;

export function stripAutomationNoise(raw: string): string {
  return raw
    .replace(ANSI_ESCAPE_RE, '')
    .replace(/\r\n/g, '\n')
    .replace(/^Call log:\n[\s\S]*$/m, '')
    .trim();
}

export type FormattedAutomationError = {
  /** Short message suitable for banners and lists */
  summary: string;
  /** Optional actionable hint */
  hint: string | null;
  /** Cleaned technical detail without ANSI / call logs */
  technical: string | null;
};

export function formatPublishAutomationError(
  raw: string | null | undefined,
): FormattedAutomationError {
  const cleaned = stripAutomationNoise(raw ?? '');
  if (!cleaned) {
    return {
      summary: '发布失败，请稍后重试。',
      hint: null,
      technical: null,
    };
  }

  const lower = cleaned.toLowerCase();

  if (
    lower.includes('err_connection_refused') ||
    lower.includes('econnrefused') ||
    /connection refused/i.test(cleaned)
  ) {
    const portMatch = cleaned.match(/localhost:(\d+)/i) ?? cleaned.match(/127\.0\.0\.1:(\d+)/i);
    const port = portMatch?.[1] ?? '6183';
    return {
      summary: `无法连接本地 BOSS 模拟站（端口 ${port}）。`,
      hint: '请先启动 boss-like（在 boss-like 项目目录执行 make dev），确认 http://localhost:6183 可访问后再重新发布。',
      technical: cleaned,
    };
  }

  if (lower.includes('err_name_not_resolved') || lower.includes('enotfound')) {
    return {
      summary: '发布目标地址无法解析。',
      hint: '请检查 BOSS_LIKE_BASE_URL 是否配置正确。',
      technical: cleaned,
    };
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      summary: '打开发布页面超时。',
      hint: '请确认 boss-like 页面可正常打开，网络与本机资源是否正常，然后重试。',
      technical: cleaned,
    };
  }

  if (/login|登录/i.test(cleaned) && /fail|失败|invalid|incorrect/i.test(cleaned)) {
    return {
      summary: '招聘端登录失败。',
      hint: '请检查 BOSS_LIKE_EMPLOYER_USERNAME / BOSS_LIKE_EMPLOYER_PASSWORD，或在 boss-like 中确认账号可用。',
      technical: cleaned,
    };
  }

  if (lower.includes('open new job page failed')) {
    return {
      summary: '打不开「发布职位」页面。',
      hint: '请确认 boss-like 前端已启动，且 /employer/jobs/new 可访问。',
      technical: cleaned,
    };
  }

  // Prefer the first line as a short summary when the raw message is multi-line.
  const firstLine =
    cleaned
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? cleaned;
  const summary = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;

  return {
    summary,
    hint: '如持续失败，可查看下方技术详情或稍后重试。',
    technical: cleaned === summary ? null : cleaned,
  };
}

export function formatPublishAutomationErrorText(raw: string | null | undefined): string {
  const formatted = formatPublishAutomationError(raw);
  return formatted.hint ? `${formatted.summary} ${formatted.hint}` : formatted.summary;
}
