import type { Page, Browser } from 'playwright';
import {
  createStructuredDomSnapshot,
  resolveTarget as resolveDomTarget,
} from '@/lib/browser/dom-resolver';
import { resolvePlaywrightHeadlessOption } from '@/lib/browser/playwright-config';
import type {
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserStepCheck,
  BrowserStepResult,
  BrowserStepTargetKey,
  BrowserTargetInput,
  LocatorMatchReport,
  StructuredDomSnapshot,
} from '@/lib/browser/types';

const DEFAULT_TIMEOUT_MS = 30_000;
const DOM_SNAPSHOT_MAX_CHARS = 200_000;
const RESOLVE_POLL_INTERVAL_MS = 50;

export function resolveHeadlessOption(headless: boolean | undefined): boolean {
  return resolvePlaywrightHeadlessOption(headless);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeSnapshotForComparison(snapshot: string): string {
  return snapshot.replace(/^\s*<!doctype[^>]*>\s*/i, '').slice(0, DOM_SNAPSHOT_MAX_CHARS);
}

async function waitForAnyVisibleText(
  page: Page,
  text: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    const matches = page.getByText(text, { exact: false });
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      if (
        await matches
          .nth(index)
          .isVisible()
          .catch(() => false)
      ) {
        return true;
      }
    }
    await sleep(RESOLVE_POLL_INTERVAL_MS);
  } while (Date.now() < deadline);
  return false;
}

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(
    private readonly options: {
      headless?: boolean;
      timeoutMs?: number;
    } = {},
  ) {}

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async getPage(): Promise<Page> {
    if (this.page) return this.page;
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      headless: resolvePlaywrightHeadlessOption(this.options.headless),
    });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.timeoutMs);
    return this.page;
  }

  private async domSnapshot(): Promise<string> {
    const page = await this.getPage();
    const snapshot = await page
      .evaluate(`document.documentElement.outerHTML.slice(0, ${DOM_SNAPSHOT_MAX_CHARS})`)
      .catch(() => '');
    return typeof snapshot === 'string' ? snapshot : '';
  }

  private async structuredDomSnapshot(): Promise<StructuredDomSnapshot> {
    const page = await this.getPage();
    return createStructuredDomSnapshot(page);
  }

  private async wrap(action: () => Promise<void>): Promise<BrowserStepResult> {
    try {
      await action();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown browser execution error',
        domSnapshot: await this.domSnapshot(),
      };
    }
  }

  private async targetFailureResult(
    report: LocatorMatchReport,
    failedTargetKey: BrowserStepTargetKey = 'target',
  ): Promise<BrowserStepResult> {
    const errorCode =
      report.status === 'ambiguous'
        ? 'ambiguous_target'
        : report.status === 'low_confidence'
          ? 'low_confidence_target'
          : 'not_found_target';
    return {
      success: false,
      error: `${errorCode}: ${report.reason ?? report.target.name}`,
      domSnapshot: await this.structuredDomSnapshot().catch(() => ''),
      match: report,
      failedTargetKey,
    };
  }

  private async targetErrorResult(
    error: unknown,
    match?: LocatorMatchReport,
    failedTargetKey?: BrowserStepTargetKey,
  ): Promise<BrowserStepResult> {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown browser execution error',
      domSnapshot: await this.structuredDomSnapshot().catch(() => ''),
      match,
      failedTargetKey,
    };
  }

  private async resolveForAction(
    target: BrowserTargetInput,
    options: BrowserResolveOptions,
  ): Promise<Awaited<ReturnType<typeof resolveDomTarget>>> {
    const page = await this.getPage();
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const deadline = Date.now() + timeoutMs;
    let lastResult = await resolveDomTarget(page, target, options);
    while (lastResult.report.status === 'not_found' && Date.now() < deadline) {
      await sleep(RESOLVE_POLL_INTERVAL_MS);
      lastResult = await resolveDomTarget(page, target, options);
    }
    return lastResult;
  }

  async navigate(url: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    });
  }

  async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
    let match: LocatorMatchReport | undefined;
    try {
      const resolved = await this.resolveForAction(target, {
        action: 'fill',
        requireEditable: true,
      });
      match = resolved.report;
      if (!resolved.locator || resolved.report.status !== 'unique') {
        return this.targetFailureResult(resolved.report, 'target');
      }
      await resolved.locator.fill(value, { timeout: this.timeoutMs });
      return { success: true, match: resolved.report };
    } catch (error) {
      return this.targetErrorResult(error, match, 'target');
    }
  }

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    let match: LocatorMatchReport | undefined;
    try {
      const resolved = await this.resolveForAction(target, { action: 'click' });
      match = resolved.report;
      if (!resolved.locator || resolved.report.status !== 'unique') {
        return this.targetFailureResult(resolved.report, 'target');
      }
      await resolved.locator.click({ timeout: this.timeoutMs });
      return { success: true, match: resolved.report };
    } catch (error) {
      return this.targetErrorResult(error, match, 'target');
    }
  }

  async fillSelector(selector: string, value: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      await page.locator(selector).first().fill(value, { timeout: this.timeoutMs });
    });
  }

  async clickSelector(selector: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      await page.locator(selector).first().click({ timeout: this.timeoutMs });
    });
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      if (page.url().includes(url)) return;
      await page.waitForURL((nextUrl) => nextUrl.href.includes(url), { timeout: this.timeoutMs });
    });
  }

  async waitForText(text: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      if (!(await waitForAnyVisibleText(page, text, this.timeoutMs))) {
        throw new Error(`wait_for_text timed out: ${text}`);
      }
    });
  }

  async waitForTarget(target: BrowserTargetInput): Promise<BrowserStepResult> {
    let match: LocatorMatchReport | undefined;
    try {
      const resolved = await this.resolveForAction(
        typeof target === 'string' ? { kind: 'text', name: target, exact: false } : target,
        { action: 'wait_for_text' },
      );
      match = resolved.report;
      if (!resolved.locator || resolved.report.status !== 'unique') {
        return this.targetFailureResult(resolved.report, 'target');
      }
      await resolved.locator.waitFor({ timeout: this.timeoutMs });
      return { success: true, match: resolved.report };
    } catch (error) {
      return this.targetErrorResult(error, match, 'target');
    }
  }

  async snapshot(): Promise<string> {
    return this.domSnapshot();
  }

  async waitForSnapshotChange(
    previousSnapshot: string,
    previousUrl?: string,
  ): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      const expectedSnapshot = normalizeSnapshotForComparison(previousSnapshot);
      const deadline = Date.now() + this.timeoutMs;
      do {
        const currentSnapshot = await page.evaluate(
          `document.documentElement.outerHTML.slice(0, ${DOM_SNAPSHOT_MAX_CHARS})`,
        );
        if (currentSnapshot !== expectedSnapshot || (previousUrl && page.url() !== previousUrl)) {
          return;
        }
        await sleep(RESOLVE_POLL_INTERVAL_MS);
      } while (Date.now() < deadline);
      throw new Error('browser_snapshot_change_timeout');
    });
  }

  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    return this.structuredDomSnapshot();
  }

  async resolveTarget(
    target: BrowserTargetInput,
    options: BrowserResolveOptions = {},
  ): Promise<LocatorMatchReport> {
    return (await this.resolveForAction(target, options)).report;
  }

  async addKeywords(
    target: BrowserTargetInput,
    values: string[],
    submitTarget: BrowserTargetInput,
  ): Promise<BrowserStepResult> {
    let match: LocatorMatchReport | undefined;
    let failedTargetKey: BrowserStepTargetKey | undefined;
    try {
      for (const value of values) {
        if (!value.trim()) continue;
        const field = await this.resolveForAction(target, {
          action: 'add_keywords',
          requireEditable: true,
        });
        match = field.report;
        failedTargetKey = 'target';
        if (!field.locator || field.report.status !== 'unique') {
          return this.targetFailureResult(field.report, 'target');
        }
        const submit = await this.resolveForAction(submitTarget, { action: 'click' });
        if (!submit.locator || submit.report.status !== 'unique') {
          return this.targetFailureResult(submit.report, 'submitTarget');
        }
        await field.locator.fill(value, { timeout: this.timeoutMs });
        match = submit.report;
        failedTargetKey = 'submitTarget';
        await submit.locator.click({ timeout: this.timeoutMs });
      }
      return { success: true, match };
    } catch (error) {
      return this.targetErrorResult(error, match, failedTargetKey);
    }
  }

  async check(check: BrowserStepCheck): Promise<boolean> {
    const page = await this.getPage();
    const timeout = check.timeout ?? Math.min(this.timeoutMs, 3_000);
    if (check.type === 'url_contains') {
      if (!check.text) return false;
      if (page.url().includes(check.text)) return true;
      return page
        .waitForURL((nextUrl) => nextUrl.href.includes(check.text ?? ''), { timeout })
        .then(() => true)
        .catch(() => false);
    }
    if (check.type === 'dom_exists') {
      if (!check.selector) return false;
      return page
        .waitForSelector(check.selector, { timeout, state: 'visible' })
        .then(() => true)
        .catch(() => false);
    }
    if (check.type === 'text_contains') {
      if (!check.text) return false;
      return waitForAnyVisibleText(page, check.text, timeout);
    }
    return false;
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
