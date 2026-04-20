import { tool } from '@langchain/core/tools';
import path from 'path';
import type { BrowserContext, Page, Response } from 'playwright';
import { z } from 'zod';
import {
  WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { assertUrlAllowed } from '@/lib/workflow-learning/url-allowlist';

const browserSnapshotSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      'Full http(s) URL (must include scheme). By default hosts are not restricted; if WORKFLOW_TOOL_URL_ALLOWLIST_MODE=allowlisted, only allowlisted hosts are accepted.',
    ),
});

const browserObserveCurrentSchema = z.object({});
const browserInspectSessionSchema = z.object({
  targetUrl: z.string().url().describe('Target page URL for the task.'),
  loginUrl: z.string().url().describe('Login page URL for the same site.'),
});
const browserProbeAuthSchema = z.object({
  targetUrl: z.string().url().describe('Protected target page URL to test access against.'),
  loginUrl: z.string().url().describe('Login page URL for the same site.'),
});

type TurnNavigationGuard = {
  blockedOrigin?: string;
  reason?: string;
};

let persistentContextPromise: Promise<BrowserContext> | null = null;
let persistentAutomationPagePromise: Promise<import('playwright').Page> | null = null;
const pageDocumentResponseState = new WeakMap<
  Page,
  {
    url: string;
    status: number;
    statusText: string;
    redirectChain: string[];
    observedAt: string;
  }
>();

async function getPersistentContext() {
  if (!persistentContextPromise) {
    const { chromium } = await import('playwright');
    const userDataDir = path.resolve(process.cwd(), '.cache/workflow-learning-playwright');
    persistentContextPromise = chromium.launchPersistentContext(userDataDir, {
      headless: false,
    });
  }
  return persistentContextPromise;
}

async function getPersistentAutomationPage() {
  if (!persistentAutomationPagePromise) {
    persistentAutomationPagePromise = (async () => {
      const context = await getPersistentContext();
      const page = await context.newPage();
      attachPageObservers(page);
      return page;
    })();
  }

  const page = await persistentAutomationPagePromise;
  if (page.isClosed()) {
    persistentAutomationPagePromise = null;
    return getPersistentAutomationPage();
  }

  return page;
}

function extractRedirectChain(response: Response): string[] {
  const chain: string[] = [];
  let req = response.request().redirectedFrom();
  while (req) {
    chain.unshift(req.url());
    req = req.redirectedFrom();
  }
  return chain;
}

function recordDocumentResponse(page: Page, response: Response) {
  if (response.request().resourceType() !== 'document') return;
  if (response.frame() !== page.mainFrame()) return;
  pageDocumentResponseState.set(page, {
    url: response.url(),
    status: response.status(),
    statusText: response.statusText(),
    redirectChain: extractRedirectChain(response),
    observedAt: new Date().toISOString(),
  });
}

function attachPageObservers(page: Page) {
  if ((page as Page & { __workflowObserversAttached?: boolean }).__workflowObserversAttached)
    return;
  (page as Page & { __workflowObserversAttached?: boolean }).__workflowObserversAttached = true;
  page.on('response', (response) => {
    recordDocumentResponse(page, response);
  });
}

function inferSignals(input: { text: string; title?: string; url?: string }) {
  const text = input.text.toLowerCase();
  const title = (input.title ?? '').toLowerCase();
  const url = (input.url ?? '').toLowerCase();
  const corpus = `${title}\n${text}`;
  const looksLikeLoginPage =
    corpus.includes('请登录') ||
    corpus.includes('登录后') ||
    corpus.includes('扫码') ||
    corpus.includes('未登录') ||
    corpus.includes('验证码') ||
    corpus.includes('注册') ||
    url.includes('/web/user') ||
    url.includes('login');
  const loading =
    corpus.includes('加载中') || corpus.includes('请稍候') || corpus.includes('loading');
  const looksLikeMessagePage =
    corpus.includes('消息') ||
    corpus.includes('聊天') ||
    corpus.includes('沟通') ||
    url.includes('/web/geek/chat');
  return { looksLikeLoginPage, loading, looksLikeMessagePage };
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

function shouldBlockNavigationForTurn(input: {
  requestedUrl: string;
  guard?: TurnNavigationGuard;
}) {
  const blockedOrigin = input.guard?.blockedOrigin;
  if (!blockedOrigin) return false;
  return normalizeOrigin(input.requestedUrl) === blockedOrigin;
}

function classifyCurrentPage(input: {
  currentUrl: string;
  targetUrl: string;
  loginUrl: string;
}): 'target' | 'login' | 'other' {
  const current = input.currentUrl.toLowerCase();
  const target = input.targetUrl.toLowerCase();
  const login = input.loginUrl.toLowerCase();
  if (current.startsWith(target)) return 'target';
  if (current.startsWith(login)) return 'login';
  return 'other';
}

type BrowserSnapshotResult = {
  requestedUrl: string | null;
  title: string;
  excerpt: string;
  currentUrl: string;
  documentResponse: {
    url: string;
    status: number;
    statusText: string;
    redirectChain: string[];
    observedAt: string;
  } | null;
  signals: ReturnType<typeof inferSignals>;
  navigationAttempted: boolean;
  redirected: boolean;
  navigationError?: string;
};

type BrowserSessionStateResult = {
  targetUrl: string;
  loginUrl: string;
  currentUrl: string;
  pageKind: 'target' | 'login' | 'other';
  sameOriginAsTarget: boolean;
  sameOriginAsLogin: boolean;
  cookieNames: string[];
  cookieCount: number;
  documentResponse: {
    url: string;
    status: number;
    statusText: string;
    redirectChain: string[];
    observedAt: string;
  } | null;
};

type BrowserAuthProbeResult = {
  targetUrl: string;
  loginUrl: string;
  currentUrl: string;
  pageKind: 'target' | 'login' | 'other';
  requiresLogin: boolean;
  accessGranted: boolean;
  cookieNames: string[];
  cookieCount: number;
  documentResponse: {
    url: string;
    status: number;
    statusText: string;
    redirectChain: string[];
    observedAt: string;
  } | null;
  title: string;
  excerpt: string;
  signals: ReturnType<typeof inferSignals>;
  navigationError?: string;
};

async function safeGoto(
  page: import('playwright').Page,
  url: string,
): Promise<{ navigationError?: string; response?: Response | null }> {
  try {
    const response = await page.goto(url, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    if (response) {
      recordDocumentResponse(page, response);
    }
    return { response };
  } catch (error) {
    return {
      navigationError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildSnapshotResult(
  page: import('playwright').Page,
  requestedUrl: string | null,
  navigationError?: string,
): Promise<BrowserSnapshotResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => undefined);
      const title = await page.title();
      const body = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      const excerpt = body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS);
      const currentUrl = page.url();
      return {
        requestedUrl,
        title,
        excerpt,
        currentUrl,
        documentResponse: pageDocumentResponseState.get(page) ?? null,
        signals: inferSignals({ text: body, title, url: currentUrl }),
        navigationAttempted: requestedUrl !== null,
        redirected: requestedUrl !== null && currentUrl !== requestedUrl,
        navigationError,
      };
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to capture stable page snapshot');
}

export async function runBrowserSnapshot(url: string): Promise<BrowserSnapshotResult> {
  assertUrlAllowed(url);
  const { chromium } = await import('playwright');
  const headless = process.env.WORKFLOW_PLAYWRIGHT_HEADLESS === 'true';
  const usePersistentContext = !headless;
  if (!usePersistentContext) {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      attachPageObservers(page);
      const { navigationError } = await safeGoto(page, url);
      return buildSnapshotResult(page, url, navigationError);
    } finally {
      await browser.close();
    }
  }

  await getPersistentContext();
  const page = await getPersistentAutomationPage();
  const { navigationError } = await safeGoto(page, url);
  return buildSnapshotResult(page, url, navigationError);
}

async function buildBlockedNavigationResult(input: {
  requestedUrl: string;
  reason: string;
}): Promise<BrowserSnapshotResult> {
  const page = await getPersistentAutomationPage();
  const snapshot = await buildSnapshotResult(page, null, input.reason);
  return {
    ...snapshot,
    requestedUrl: input.requestedUrl,
    navigationAttempted: false,
    redirected: snapshot.currentUrl !== input.requestedUrl,
  };
}

export async function observeCurrentBrowserPage(): Promise<BrowserSnapshotResult> {
  const page = await getPersistentAutomationPage();
  return buildSnapshotResult(page, null);
}

export async function inspectBrowserSessionState(input: {
  targetUrl: string;
  loginUrl: string;
}): Promise<BrowserSessionStateResult> {
  assertUrlAllowed(input.targetUrl);
  assertUrlAllowed(input.loginUrl);

  const context = await getPersistentContext();
  const page = await getPersistentAutomationPage();
  const currentUrl = page.url() || 'about:blank';
  const targetOrigin = normalizeOrigin(input.targetUrl);
  const loginOrigin = normalizeOrigin(input.loginUrl);
  const cookies = await context.cookies([targetOrigin, loginOrigin]);
  const uniqueCookieNames = Array.from(new Set(cookies.map((cookie) => cookie.name))).sort();

  return {
    targetUrl: input.targetUrl,
    loginUrl: input.loginUrl,
    currentUrl,
    pageKind: classifyCurrentPage({
      currentUrl,
      targetUrl: input.targetUrl,
      loginUrl: input.loginUrl,
    }),
    sameOriginAsTarget: currentUrl.startsWith(targetOrigin),
    sameOriginAsLogin: currentUrl.startsWith(loginOrigin),
    cookieNames: uniqueCookieNames,
    cookieCount: cookies.length,
    documentResponse: pageDocumentResponseState.get(page) ?? null,
  };
}

export async function probeBrowserAuth(input: {
  targetUrl: string;
  loginUrl: string;
}): Promise<BrowserAuthProbeResult> {
  assertUrlAllowed(input.targetUrl);
  assertUrlAllowed(input.loginUrl);

  const context = await getPersistentContext();
  const page = await getPersistentAutomationPage();
  const { navigationError } = await safeGoto(page, input.targetUrl);
  const snapshot = await buildSnapshotResult(page, input.targetUrl, navigationError);
  const cookies = await context.cookies([
    normalizeOrigin(input.targetUrl),
    normalizeOrigin(input.loginUrl),
  ]);
  const uniqueCookieNames = Array.from(new Set(cookies.map((cookie) => cookie.name))).sort();
  const pageKind = classifyCurrentPage({
    currentUrl: snapshot.currentUrl,
    targetUrl: input.targetUrl,
    loginUrl: input.loginUrl,
  });
  const redirectChain = snapshot.documentResponse?.redirectChain ?? [];
  const redirectedToLogin =
    redirectChain.some((url) => url.toLowerCase().startsWith(input.loginUrl.toLowerCase())) ||
    snapshot.currentUrl.toLowerCase().startsWith(input.loginUrl.toLowerCase());
  const requiresLogin =
    pageKind === 'login' || redirectedToLogin || snapshot.signals.looksLikeLoginPage;
  const accessGranted = pageKind === 'target' && !requiresLogin;

  return {
    targetUrl: input.targetUrl,
    loginUrl: input.loginUrl,
    currentUrl: snapshot.currentUrl,
    pageKind,
    requiresLogin,
    accessGranted,
    cookieNames: uniqueCookieNames,
    cookieCount: cookies.length,
    documentResponse: snapshot.documentResponse,
    title: snapshot.title,
    excerpt: snapshot.excerpt,
    signals: snapshot.signals,
    navigationError,
  };
}

/**
 * LangChain tool: opens URLs and returns title + text excerpt for the agent.
 */
export function createBrowserSnapshotTool(options?: { guard?: TurnNavigationGuard }) {
  return tool(
    async (input: z.infer<typeof browserSnapshotSchema>) => {
      if (shouldBlockNavigationForTurn({ requestedUrl: input.url, guard: options?.guard })) {
        return JSON.stringify(
          await buildBlockedNavigationResult({
            requestedUrl: input.url,
            reason:
              options?.guard?.reason ??
              'Navigation blocked for this turn because auth probe determined login is required.',
          }),
        );
      }
      const result = await runBrowserSnapshot(input.url);
      return JSON.stringify(result);
    },
    {
      name: 'browser_snapshot',
      description:
        'Navigate to a URL and return factual JSON: requestedUrl, currentUrl, title, excerpt, documentResponse(status/url/redirectChain), signals, navigationAttempted, redirected, and optional navigationError.',
      schema: browserSnapshotSchema,
    },
  );
}

export function createBrowserObserveCurrentTool() {
  return tool(
    async () => {
      const result = await observeCurrentBrowserPage();
      return JSON.stringify(result);
    },
    {
      name: 'browser_observe_current',
      description:
        'Inspect the currently open browser page without navigating. Returns factual JSON with currentUrl, title, excerpt, latest documentResponse(status/url/redirectChain), signals, navigationAttempted=false, and redirected=false.',
      schema: browserObserveCurrentSchema,
    },
  );
}

export function createBrowserInspectSessionTool() {
  return tool(
    async (input: z.infer<typeof browserInspectSessionSchema>) => {
      const result = await inspectBrowserSessionState(input);
      return JSON.stringify(result);
    },
    {
      name: 'browser_inspect_session',
      description:
        'Inspect browser session facts for a site without navigating. Returns currentUrl, pageKind(target/login/other), same-origin flags, cookie names/count, and latest documentResponse for the target/login origins.',
      schema: browserInspectSessionSchema,
    },
  );
}

export function createBrowserProbeAuthTool(options?: { guard?: TurnNavigationGuard }) {
  return tool(
    async (input: z.infer<typeof browserProbeAuthSchema>) => {
      const result = await probeBrowserAuth(input);
      if (result.requiresLogin && options?.guard) {
        options.guard.blockedOrigin = normalizeOrigin(input.targetUrl);
        options.guard.reason = `Navigation blocked for this turn after auth probe found login is required for ${input.targetUrl}.`;
      }
      return JSON.stringify(result);
    },
    {
      name: 'browser_probe_auth',
      description:
        'Probe whether a protected target page currently requires login by navigating to the target once and returning factual auth results: currentUrl, pageKind, requiresLogin, accessGranted, cookie names/count, title, excerpt, signals, and documentResponse with redirectChain.',
      schema: browserProbeAuthSchema,
    },
  );
}

export const _browserSnapshotToolTestOnly = {
  classifyCurrentPage,
  inferSignals,
  shouldBlockNavigationForTurn,
};
