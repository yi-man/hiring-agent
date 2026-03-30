import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_PLAYWRIGHT_TIMEOUT_MS } from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({
  selector: z.string().describe('CSS selector of the element to click.'),
});

export function createBrowserClickTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        await session.page
          .locator(input.selector)
          .click({ timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS });
        await session.page.waitForLoadState('domcontentloaded').catch(() => {});
        const newUrl = session.page.url();
        const newTitle = await session.page.title();
        return JSON.stringify({ success: true, newUrl, newTitle });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ success: false, error: message });
      }
    },
    {
      name: 'browser_click',
      description:
        'Click an element on the current page by CSS selector. Returns the page state after clicking.',
      schema,
    },
  );
}
