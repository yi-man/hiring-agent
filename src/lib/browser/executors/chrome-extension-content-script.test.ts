/**
 * @jest-environment node
 */
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import type { BrowserCommand } from '@/lib/browser/types';

let browser: Browser;

async function withContentScriptPage(html: string, fn: (page: Page) => Promise<void>) {
  const page = await browser.newPage();
  try {
    await page.setContent(html);
    await page.evaluate(() => {
      (globalThis as Record<string, unknown>).chrome = {
        runtime: {
          onMessage: {
            addListener(listener: unknown) {
              (globalThis as Record<string, unknown>).__hiringAgentListener = listener;
            },
          },
        },
      };
    });
    await page.addScriptTag({
      path: path.resolve('chrome-extensions/browser-automation/content-script.js'),
    });
    await fn(page);
  } finally {
    await page.close();
  }
}

async function runCommand(page: Page, command: BrowserCommand) {
  return page.evaluate((nextCommand) => {
    return new Promise((resolve) => {
      const listener = (globalThis as Record<string, unknown>).__hiringAgentListener as (
        message: unknown,
        sender: unknown,
        sendResponse: (value: unknown) => void,
      ) => boolean;
      listener({ type: 'BROWSER_AUTOMATION_COMMAND', command: nextCommand }, {}, resolve);
    });
  }, command);
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

describe('Chrome extension content script resolver', () => {
  it('waits for a DOM snapshot or URL change', async () => {
    await withContentScriptPage('<main><div id="results">加载中</div></main>', async (page) => {
      const previousSnapshot = await page.evaluate('document.documentElement.outerHTML');
      await page.evaluate(
        "setTimeout(() => { document.querySelector('#results').textContent = '候选人已加载'; }, 100)",
      );
      const command: BrowserCommand = {
        id: 'cmd-wait-snapshot',
        taskId: 'task-1',
        stepId: 'search_candidates',
        action: 'wait_for_snapshot_change',
        params: { previousSnapshot, previousUrl: page.url() },
        timeoutMs: 1_000,
      };

      await expect(runCommand(page, command)).resolves.toEqual(
        expect.objectContaining({ commandId: command.id, success: true }),
      );
    });
  });

  it('resolves exact field labels with required markers', async () => {
    await withContentScriptPage(
      `
        <main>
          <h1>发布职位</h1>
          <form>
            <div><label>职位名称 *</label><input placeholder="如：高级前端工程师" /></div>
            <div><label>公司名称 *</label><input placeholder="如：字节跳动" /></div>
          </form>
        </main>
      `,
      async (page) => {
        const command: BrowserCommand = {
          id: 'cmd-company',
          taskId: 'task-1',
          stepId: 'fill_company',
          action: 'fill',
          target: {
            kind: 'field',
            role: 'textbox',
            name: '公司名称',
            exact: true,
          },
          params: { value: '弈曼科技' },
          timeoutMs: 1_000,
        };

        await expect(runCommand(page, command)).resolves.toEqual(
          expect.objectContaining({
            commandId: 'cmd-company',
            success: true,
            match: expect.objectContaining({
              status: 'unique',
              chosen: expect.objectContaining({ accessibleName: '公司名称 *' }),
            }),
          }),
        );
        await expect(page.locator('input').nth(0).inputValue()).resolves.toBe('');
        await expect(page.locator('input').nth(1).inputValue()).resolves.toBe('弈曼科技');
      },
    );
  });
});
