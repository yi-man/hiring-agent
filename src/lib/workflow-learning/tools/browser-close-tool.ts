import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ToolContext } from './tool-context';

const schema = z.object({});

export function createBrowserCloseTool(ctx: ToolContext) {
  return tool(
    async () => {
      try {
        await ctx.sessionManager.close(ctx.userId);
        return JSON.stringify({ closed: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ closed: false, error: message });
      }
    },
    {
      name: 'browser_close',
      description:
        'Close the browser session. Only call this when the plan explicitly requires closing, or when all browser tasks are done.',
      schema,
    },
  );
}
