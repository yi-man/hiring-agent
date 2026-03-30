import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { assertUrlAllowed } from '@/lib/workflow-learning/url-allowlist';

const schema = z.object({
  url: z
    .string()
    .url()
    .describe(
      'Full http(s) URL (must include scheme). By default hosts are not restricted; if WORKFLOW_TOOL_URL_ALLOWLIST_MODE=allowlisted, only allowlisted hosts are accepted.',
    ),
});

export async function runBrowserSnapshot(url: string): Promise<{ title: string; excerpt: string }> {
  assertUrlAllowed(url);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    const title = await page.title();
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const excerpt = body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS);
    return { title, excerpt };
  } finally {
    await browser.close();
  }
}

/**
 * LangChain tool: opens URLs and returns title + text excerpt for the agent.
 */
export function createBrowserSnapshotTool() {
  return tool(
    async (input: z.infer<typeof schema>) => {
      const result = await runBrowserSnapshot(input.url);
      return JSON.stringify(result);
    },
    {
      name: 'browser_snapshot',
      description:
        'Open a web page in a headless browser and return JSON with title and visible text excerpt. Use when the user asks to fetch or inspect a page.',
      schema,
    },
  );
}
