import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_PLAYWRIGHT_TIMEOUT_MS } from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({
  selector: z.string().describe('CSS selector of the input element.'),
  text: z.string().describe('Text to fill into the input element.'),
});

export function createBrowserTypeTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        await session.page
          .locator(input.selector)
          .fill(input.text, { timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS });
        return JSON.stringify({ success: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ success: false, error: message });
      }
    },
    {
      name: 'browser_type',
      description:
        'Fill text into an input element by CSS selector. Clears existing content first.',
      schema,
    },
  );
}
