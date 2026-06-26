import type { Locator, Page, Browser } from 'playwright';
import type {
  BrowserExecutor,
  BrowserStepResult,
  PublishStepCheck,
} from '@/lib/jd-publishing/types';

const DEFAULT_TIMEOUT_MS = 30_000;
const DOM_SNAPSHOT_MAX_CHARS = 8_000;

export function shouldProxyApiRequest(url: string): boolean {
  return new URL(url).pathname.startsWith('/api/');
}

export function isRouteContextDisposedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Request context disposed');
}

function escapeXPathText(text: string): string {
  if (!text.includes("'")) return `'${text}'`;
  return `concat('${text.split("'").join("', \"'\", '")}')`;
}

function normalizeLocator(locator: string): string {
  return locator.trim().replace(/\s+\*$/, '');
}

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(
    private readonly options: {
      headless?: boolean;
      timeoutMs?: number;
      apiBaseUrl?: string;
    } = {},
  ) {}

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async getPage(): Promise<Page> {
    if (this.page) return this.page;
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({ headless: this.options.headless ?? true });
    const context = await this.browser.newContext();
    const apiBaseUrl = this.options.apiBaseUrl?.replace(/\/+$/, '');
    if (apiBaseUrl) {
      await context.route('**/*', async (route, request) => {
        if (!shouldProxyApiRequest(request.url())) {
          await route.continue();
          return;
        }
        const sourceUrl = new URL(request.url());
        const targetUrl = `${apiBaseUrl}${sourceUrl.pathname}${sourceUrl.search}`;
        try {
          const response = await route.fetch({ url: targetUrl });
          await route.fulfill({ response });
        } catch (error) {
          if (isRouteContextDisposedError(error)) return;
          await route.abort('failed').catch(() => undefined);
        }
      });
    }
    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.timeoutMs);
    return this.page;
  }

  private async domSnapshot(): Promise<string> {
    const page = await this.getPage();
    return page
      .content()
      .then((html) => html.slice(0, DOM_SNAPSHOT_MAX_CHARS))
      .catch(() => '');
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

  private async locatorFromLabelText(page: Page, locator: string): Promise<Locator> {
    const label = normalizeLocator(locator);
    const labelExpression = escapeXPathText(label);
    const byLabel = page.getByLabel(label, { exact: false });
    const byPlaceholder = page.getByPlaceholder(label, { exact: false });
    const inputAfterLabel = page.locator(
      `xpath=//label[contains(normalize-space(.), ${labelExpression})]` +
        `/following::*[self::input or self::textarea][1]`,
    );

    return byLabel.or(byPlaceholder).or(inputAfterLabel).or(page.locator(locator)).first();
  }

  private async clickBestMatch(page: Page, locator: string): Promise<void> {
    const label = normalizeLocator(locator);
    const candidates: Locator[] = [
      page.getByRole('button', { name: label, exact: false }).first(),
      page.getByRole('link', { name: label, exact: false }).first(),
      page.getByText(label, { exact: true }).first(),
      page.locator(locator).first(),
    ];
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        await candidate.click({ timeout: this.timeoutMs });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Unable to click ${locator}`);
  }

  async navigate(url: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    });
  }

  async fill(locator: string, value: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      await (await this.locatorFromLabelText(page, locator)).fill(value);
    });
  }

  async click(locator: string): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      await this.clickBestMatch(page, locator);
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
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: this.timeoutMs });
    });
  }

  async addKeywords(
    locator: string,
    values: string[],
    submitLocator: string,
  ): Promise<BrowserStepResult> {
    return this.wrap(async () => {
      const page = await this.getPage();
      for (const value of values) {
        if (!value.trim()) continue;
        await (await this.locatorFromLabelText(page, locator)).fill(value);
        await this.clickBestMatch(page, submitLocator);
      }
    });
  }

  async check(check: PublishStepCheck): Promise<boolean> {
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
        .locator(check.selector)
        .first()
        .waitFor({ timeout })
        .then(() => true)
        .catch(() => false);
    }
    if (check.type === 'text_contains') {
      if (!check.text) return false;
      return page
        .getByText(check.text, { exact: false })
        .first()
        .waitFor({ timeout })
        .then(() => true)
        .catch(() => false);
    }
    return false;
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
