import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  BROWSER_WAIT_DEFAULT_TIMEOUT_MS,
  BROWSER_WAIT_POLL_INTERVAL_MS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({
  reason: z.string().describe('Why the user needs to take action (shown in the chat UI).'),
  waitForUrlChange: z.boolean().optional().describe('Wait until the page URL changes.'),
  waitForSelector: z
    .string()
    .optional()
    .describe('Wait until this CSS selector appears on the page.'),
  timeoutMs: z.number().optional().describe('Max wait time in ms (default 120000).'),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBrowserWaitForUserTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      const timeout = input.timeoutMs ?? BROWSER_WAIT_DEFAULT_TIMEOUT_MS;
      const ts = () => new Date().toISOString();

      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        const originalUrl = session.page.url();

        ctx.emitEvent({
          type: 'user_action_required',
          runId: ctx.runId,
          timestamp: ts(),
          reason: input.reason,
        });

        const deadline = Date.now() + timeout;
        let resolved = false;

        while (Date.now() < deadline) {
          await sleep(BROWSER_WAIT_POLL_INTERVAL_MS);
          ctx.sessionManager.touch(ctx.userId);

          if (!session.browser.isConnected()) {
            return JSON.stringify({ resolved: false, reason: 'Browser disconnected' });
          }

          if (input.waitForUrlChange && session.page.url() !== originalUrl) {
            resolved = true;
            break;
          }

          if (input.waitForSelector) {
            const found = await session.page
              .locator(input.waitForSelector)
              .count()
              .catch(() => 0);
            if (found > 0) {
              resolved = true;
              break;
            }
          }

          if (!input.waitForUrlChange && !input.waitForSelector) {
            const body = await session.page
              .locator('body')
              .innerText()
              .catch(() => '');
            const hasLoginKeywords = /登录|sign\s*in|log\s*in|password/i.test(body);
            if (!hasLoginKeywords) {
              resolved = true;
              break;
            }
          }
        }

        if (resolved) {
          ctx.emitEvent({ type: 'user_action_resolved', runId: ctx.runId, timestamp: ts() });
          const newUrl = session.page.url();
          const newTitle = await session.page.title();
          const body = await session.page
            .locator('body')
            .innerText()
            .catch(() => '');
          const excerpt = body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS);
          return JSON.stringify({ resolved: true, newUrl, newTitle, excerpt });
        }

        return JSON.stringify({ resolved: false, reason: 'timeout' });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ resolved: false, reason: message });
      }
    },
    {
      name: 'browser_wait_for_user',
      description:
        'Pause execution and notify the user that manual action is needed in the browser window (e.g. login). Polls for page changes and resumes automatically.',
      schema,
    },
  );
}
