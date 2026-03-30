import type { Browser, BrowserContext, Page } from 'playwright';
import { BROWSER_SESSION_IDLE_TIMEOUT_MS } from './constants';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export class BrowserSessionManager {
  private sessions = new Map<string, BrowserSession>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async getOrCreate(userId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(userId);
    if (existing && existing.browser.isConnected()) {
      existing.lastActiveAt = new Date();
      this.resetIdleTimer(userId);
      return existing;
    }

    if (existing) {
      this.sessions.delete(userId);
      this.clearIdleTimer(userId);
    }

    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const session: BrowserSession = {
      browser,
      context,
      page,
      userId,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.sessions.set(userId, session);
    this.resetIdleTimer(userId);
    return session;
  }

  async close(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;
    this.clearIdleTimer(userId);
    this.sessions.delete(userId);
    try {
      await session.browser.close();
    } catch {
      /* browser may already be closed */
    }
  }

  async shutdownAll(): Promise<void> {
    const userIds = [...this.sessions.keys()];
    await Promise.all(userIds.map((id) => this.close(id)));
  }

  isActive(userId: string): boolean {
    const session = this.sessions.get(userId);
    return !!session && session.browser.isConnected();
  }

  getStatus(userId: string): { url: string; title: string } | null {
    const session = this.sessions.get(userId);
    if (!session || !session.browser.isConnected()) return null;
    try {
      return { url: session.page.url(), title: '' };
    } catch {
      return null;
    }
  }

  touch(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActiveAt = new Date();
      this.resetIdleTimer(userId);
    }
  }

  private resetIdleTimer(userId: string): void {
    this.clearIdleTimer(userId);
    this.idleTimers.set(
      userId,
      setTimeout(() => {
        void this.close(userId);
      }, BROWSER_SESSION_IDLE_TIMEOUT_MS),
    );
  }

  private clearIdleTimer(userId: string): void {
    const timer = this.idleTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(userId);
    }
  }
}

let _instance: BrowserSessionManager | null = null;

export function getBrowserSessionManager(): BrowserSessionManager {
  if (!_instance) {
    _instance = new BrowserSessionManager();
    const cleanup = () => {
      void _instance?.shutdownAll();
    };
    process.on('beforeExit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }
  return _instance;
}
