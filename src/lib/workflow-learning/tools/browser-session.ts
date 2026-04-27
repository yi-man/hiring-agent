import {
  WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { assertUrlAllowed } from '@/lib/workflow-learning/url-allowlist';

type PageLike = {
  goto(url: string, options?: { timeout: number; waitUntil: 'domcontentloaded' }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  locator(selector: string): {
    innerText(): Promise<string>;
    first?(): { innerText(): Promise<string> };
  };
};

type BrowserContextLike = {
  newPage(): Promise<PageLike>;
  storageState(): Promise<unknown>;
  close(): Promise<unknown>;
};

type BrowserLike = {
  newContext(options?: { storageState?: unknown }): Promise<BrowserContextLike>;
  close(): Promise<unknown>;
};

type ChromiumLike = {
  launch(options?: { headless: boolean }): Promise<BrowserLike>;
};

export type LoginSuccessCriteria = {
  urlIncludes?: string[];
  urlNotIncludes?: string[];
  textIncludes?: string[];
  textNotIncludes?: string[];
};

const DEFAULT_LOGIN_TIMEOUT_MS = 120_000;
const DEFAULT_LOGIN_POLL_INTERVAL_MS = 1_000;
const FIRST_MESSAGE_SELECTORS = [
  '[data-testid="message-list"] [data-testid="message-item"]',
  '[data-testid="message-item"]',
  '.message-list .message-item',
  '.chat-list .chat-item',
  '.geek-item',
  '.message-item',
];

type BrowserSession = {
  browser: BrowserLike;
  context: BrowserContextLike;
  page: PageLike;
  headless: boolean;
};

export class BrowserSessionManager {
  private readonly sessions = new Map<string, BrowserSession>();

  constructor(
    private readonly options: {
      chromium?: ChromiumLike;
      loginPollIntervalMs?: number;
    } = {},
  ) {}

  async snapshot(input: { sessionId: string; url: string }): Promise<{
    title: string;
    excerpt: string;
    requestedUrl: string;
    url: string;
    urlMatchesRequested: boolean;
  }> {
    assertUrlAllowed(input.url);
    const session = await this.getOrCreateSession(input.sessionId, false);
    await session.page.goto(input.url, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    const title = await session.page.title();
    const body = await this.readBodyText(session.page);
    return {
      title,
      requestedUrl: input.url,
      url: session.page.url(),
      urlMatchesRequested: urlsMatch(input.url, session.page.url()),
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
    };
  }

  async openLogin(input: {
    sessionId: string;
    loginUrl: string;
  }): Promise<{ sessionId: string; loginUrl: string }> {
    assertUrlAllowed(input.loginUrl);
    const session = await this.getOrCreateSession(input.sessionId, false);
    await session.page.goto(input.loginUrl, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    return { sessionId: input.sessionId, loginUrl: input.loginUrl };
  }

  async verifyLogin(input: {
    sessionId: string;
    success: LoginSuccessCriteria;
    timeoutMs?: number;
  }): Promise<{ sessionId: string; loggedIn: boolean; url: string; excerpt: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return {
        sessionId: input.sessionId,
        loggedIn: false,
        url: '',
        excerpt: 'Browser session not found',
      };
    }
    if (!hasPositiveSuccessCriteria(input.success)) {
      return {
        sessionId: input.sessionId,
        loggedIn: false,
        url: session.page.url(),
        excerpt: 'Login success criteria must include urlIncludes or textIncludes.',
      };
    }

    const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS);
    let lastResult = await this.checkLogin(input.sessionId, session, input.success);
    while (!lastResult.loggedIn && Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await sleep(Math.min(this.getPollIntervalMs(), remainingMs));
      lastResult = await this.checkLogin(input.sessionId, session, input.success);
    }

    if (lastResult.loggedIn) {
      await session.context.storageState();
    }

    return lastResult;
  }

  async inspectLogin(input: {
    sessionId: string;
    success: LoginSuccessCriteria;
  }): Promise<{ sessionId: string; loggedIn: boolean; url: string; excerpt: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return {
        sessionId: input.sessionId,
        loggedIn: false,
        url: '',
        excerpt: 'Browser session not found',
      };
    }
    if (!hasPositiveSuccessCriteria(input.success)) {
      return {
        sessionId: input.sessionId,
        loggedIn: false,
        url: session.page.url(),
        excerpt: 'Login success criteria must include urlIncludes or textIncludes.',
      };
    }

    return this.checkLogin(input.sessionId, session, input.success);
  }

  async navigate(input: { sessionId: string; url: string }): Promise<{
    sessionId: string;
    requestedUrl: string;
    url: string;
    title: string;
    excerpt: string;
    urlMatchesRequested: boolean;
  }> {
    assertUrlAllowed(input.url);
    const session = await this.getOrCreateSession(input.sessionId, false);
    await session.page.goto(input.url, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    const title = await session.page.title();
    const body = await this.readBodyText(session.page);
    return {
      sessionId: input.sessionId,
      requestedUrl: input.url,
      url: session.page.url(),
      title,
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
      urlMatchesRequested: urlsMatch(input.url, session.page.url()),
    };
  }

  async waitForText(input: {
    sessionId: string;
    text: string;
    timeoutMs?: number;
  }): Promise<{ sessionId: string; found: boolean; url: string; excerpt: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return {
        sessionId: input.sessionId,
        found: false,
        url: '',
        excerpt: 'Browser session not found',
      };
    }

    const deadline = Date.now() + (input.timeoutMs ?? WORKFLOW_PLAYWRIGHT_TIMEOUT_MS);
    let body = await this.readBodyText(session.page);
    while (!body.includes(input.text) && Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await sleep(Math.min(this.getPollIntervalMs(), remainingMs));
      body = await this.readBodyText(session.page);
    }

    return {
      sessionId: input.sessionId,
      found: body.includes(input.text),
      url: session.page.url(),
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
    };
  }

  async extractText(input: {
    sessionId: string;
    selectorHint?: string;
    maxChars?: number;
  }): Promise<{ sessionId: string; text: string; url: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { sessionId: input.sessionId, text: '', url: '' };
    }

    const body =
      input.selectorHint && isFirstMessageHint(input.selectorHint)
        ? await this.readFirstAvailableSelectorText(session.page, FIRST_MESSAGE_SELECTORS)
        : '';
    const text = body || (await this.readBodyText(session.page));
    return {
      sessionId: input.sessionId,
      text: text.slice(0, input.maxChars ?? WORKFLOW_TOOL_RESULT_MAX_CHARS).trim(),
      url: session.page.url(),
    };
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.context.close();
    await session.browser.close();
  }

  private async getOrCreateSession(sessionId: string, headless: boolean): Promise<BrowserSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (!headless && existing.headless) {
        await this.close(sessionId);
      } else {
        return existing;
      }
    }

    const chromium = await this.getChromium();
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = { browser, context, page, headless };
    this.sessions.set(sessionId, session);
    return session;
  }

  private async getChromium(): Promise<ChromiumLike> {
    if (this.options.chromium) return this.options.chromium;
    const { chromium } = await import('playwright');
    return chromium;
  }

  private getPollIntervalMs(): number {
    return this.options.loginPollIntervalMs ?? DEFAULT_LOGIN_POLL_INTERVAL_MS;
  }

  private async readBodyText(page: PageLike): Promise<string> {
    return page
      .locator('body')
      .innerText()
      .catch(() => '');
  }

  private async readFirstAvailableSelectorText(
    page: PageLike,
    selectors: readonly string[],
  ): Promise<string> {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const text = await (locator.first?.() ?? locator).innerText().catch(() => '');
      if (text.trim()) return text;
    }
    return '';
  }

  private async checkLogin(
    sessionId: string,
    session: BrowserSession,
    success: LoginSuccessCriteria,
  ): Promise<{ sessionId: string; loggedIn: boolean; url: string; excerpt: string }> {
    const url = session.page.url();
    const body = await this.readBodyText(session.page);
    return {
      sessionId,
      loggedIn:
        matchesIncludes(url, success.urlIncludes) &&
        matchesNotIncludes(url, success.urlNotIncludes) &&
        matchesIncludes(body, success.textIncludes) &&
        matchesNotIncludes(body, success.textNotIncludes),
      url,
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
    };
  }
}

function isFirstMessageHint(selectorHint: string): boolean {
  return /first\s+message|第一.*(消息|信息)|首条.*(消息|信息)/i.test(selectorHint);
}

function matchesIncludes(value: string, needles: string[] | undefined): boolean {
  return !needles?.length || needles.some((needle) => value.includes(needle));
}

function matchesNotIncludes(value: string, needles: string[] | undefined): boolean {
  return !needles?.length || needles.every((needle) => !value.includes(needle));
}

function hasPositiveSuccessCriteria(criteria: LoginSuccessCriteria): boolean {
  return Boolean(
    criteria.urlIncludes?.length ||
    criteria.urlNotIncludes?.length ||
    criteria.textIncludes?.length ||
    criteria.textNotIncludes?.length,
  );
}

function urlsMatch(requestedUrl: string, currentUrl: string): boolean {
  try {
    const requested = new URL(requestedUrl);
    const current = new URL(currentUrl);
    return requested.origin === current.origin && requested.pathname === current.pathname;
  } catch {
    return requestedUrl === currentUrl;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
