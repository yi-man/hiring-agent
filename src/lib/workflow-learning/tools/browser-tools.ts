import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  BrowserSessionManager,
  type LoginSuccessCriteria,
} from '@/lib/workflow-learning/tools/browser-session';

const loginSuccessSchema = z.object({
  urlIncludes: z.array(z.string().min(1)).optional(),
  urlNotIncludes: z.array(z.string().min(1)).optional(),
  textIncludes: z.array(z.string().min(1)).optional(),
});

export function createWorkflowBrowserTools(
  manager = new BrowserSessionManager(),
  defaultSessionId = 'default',
) {
  const sessionIdSchema = z.string().min(1).default(defaultSessionId);
  const snapshotSchema = z.object({
    sessionId: sessionIdSchema,
    url: z.string().url().describe('Full http(s) URL to inspect.'),
  });
  const openLoginSchema = z.object({
    sessionId: sessionIdSchema,
    loginUrl: z.string().url().describe('Login URL to open in a visible local browser window.'),
  });
  const verifyLoginSchema = z.object({
    sessionId: sessionIdSchema,
    success: loginSuccessSchema.describe('Conditions that indicate the user is now logged in.'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(300_000)
      .optional()
      .describe('Optional polling timeout while the user completes login.'),
  });

  return [
    tool(
      async (input: z.infer<typeof snapshotSchema>) => {
        const result = await manager.snapshot(input);
        return JSON.stringify(result);
      },
      {
        name: 'browser_snapshot',
        description:
          'Open a page in a reusable browser session and return JSON with current URL, title, and visible text excerpt.',
        schema: snapshotSchema,
      },
    ),
    tool(
      async (input: z.infer<typeof openLoginSchema>) => {
        const result = await manager.openLogin(input);
        return JSON.stringify(result);
      },
      {
        name: 'browser_open_login',
        description:
          'Open a login URL in a visible local browser window so the user can complete QR-code or manual login.',
        schema: openLoginSchema,
      },
    ),
    tool(
      async (input: z.infer<typeof verifyLoginSchema>) => {
        const result = await manager.verifyLogin({
          sessionId: input.sessionId,
          success: input.success as LoginSuccessCriteria,
          timeoutMs: input.timeoutMs,
        });
        return JSON.stringify(result);
      },
      {
        name: 'browser_verify_login',
        description:
          'Check whether the reusable browser session is logged in using URL and visible-text success criteria.',
        schema: verifyLoginSchema,
      },
    ),
  ];
}
