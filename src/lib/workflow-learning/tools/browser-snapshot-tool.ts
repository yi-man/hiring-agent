import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_TOOL_RESULT_MAX_CHARS } from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({});

export function createBrowserSnapshotTool(ctx: ToolContext) {
  return tool(
    async () => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        if (!session.browser.isConnected()) {
          return JSON.stringify({ error: 'Browser session is disconnected. Consider replanning.' });
        }
        const title = await session.page.title();
        const url = session.page.url();
        const body = await session.page
          .locator('body')
          .innerText()
          .catch(() => '');
        const excerpt = body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS);
        return JSON.stringify({ title, url, excerpt });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: 'browser_snapshot',
      description:
        'Read the current page title, URL, and visible text excerpt. No input needed — reads from the active browser session.',
      schema,
    },
  );
}
