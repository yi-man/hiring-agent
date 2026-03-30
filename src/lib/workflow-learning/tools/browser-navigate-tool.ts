import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_PLAYWRIGHT_TIMEOUT_MS } from '../constants';
import { assertUrlAllowed } from '../url-allowlist';
import type { ToolContext } from './tool-context';

const schema = z.object({
  url: z.string().url().describe('Full http(s) URL to navigate to.'),
});

export function createBrowserNavigateTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        assertUrlAllowed(input.url);
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        const response = await session.page.goto(input.url, {
          timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
          waitUntil: 'domcontentloaded',
        });
        const title = await session.page.title();
        const finalUrl = session.page.url();
        const status = response?.status() ?? 0;
        return JSON.stringify({ title, url: finalUrl, status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: 'browser_navigate',
      description:
        'Navigate to a URL in the browser. Returns page title, final URL (after redirects), and HTTP status. URL must be http(s) and pass the allowlist.',
      schema,
    },
  );
}
