import {
  WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { assertUrlAllowed } from '@/lib/workflow-learning/url-allowlist';

type PageLike = {
  goto(url: string, options?: { timeout: number; waitUntil: 'domcontentloaded' }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  locator(selector: string): { innerText(): Promise<string> };
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
};

const DEFAULT_LOGIN_TIMEOUT_MS = 120_000;
const DEFAULT_LOGIN_POLL_INTERVAL_MS = 1_000;

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

  async snapshot(input: {
    sessionId: string;
    url: string;
  }): Promise<{ title: string; excerpt: string; url: string }> {
    assertUrlAllowed(input.url);
    const session = await this.getOrCreateSession(input.sessionId, true);
    await session.page.goto(input.url, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    const title = await session.page.title();
    const body = await this.readBodyText(session.page);
    return {
      title,
      url: session.page.url(),
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
      await sleep(this.options.loginPollIntervalMs ?? DEFAULT_LOGIN_POLL_INTERVAL_MS);
      lastResult = await this.checkLogin(input.sessionId, session, input.success);
    }

    if (lastResult.loggedIn) {
      await session.context.storageState();
    }

    return lastResult;
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

  private async readBodyText(page: PageLike): Promise<string> {
    return page
      .locator('body')
      .innerText()
      .catch(() => '');
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
        matchesIncludes(body, success.textIncludes),
      url,
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
    };
  }
}

function matchesIncludes(value: string, needles: string[] | undefined): boolean {
  return !needles?.length || needles.some((needle) => value.includes(needle));
}

function matchesNotIncludes(value: string, needles: string[] | undefined): boolean {
  return !needles?.length || needles.every((needle) => !value.includes(needle));
}

function hasPositiveSuccessCriteria(criteria: LoginSuccessCriteria): boolean {
  return Boolean(criteria.urlIncludes?.length || criteria.textIncludes?.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
