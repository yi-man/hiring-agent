import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { hashPassword } from '../../src/lib/auth/password';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const INTERNAL_COMMAND_TOKEN = process.env.BROWSER_AUTOMATION_INTERNAL_TOKEN?.trim();
const HAS_DB_ENV = Boolean(
  process.env.DATABASE_URL ||
  (process.env.POSTGRES_HOST &&
    process.env.POSTGRES_PORT &&
    process.env.POSTGRES_USER &&
    process.env.POSTGRES_DATABASE),
);

test('unpacked Chrome extension reconnects after page login and executes on the real app page', async ({
  request,
}, testInfo) => {
  test.skip(!HAS_DB_ENV, 'Requires POSTGRES_* or DATABASE_URL in env (see .env.local).');

  const rawBaseURL = testInfo.project.use.baseURL;
  if (!rawBaseURL || typeof rawBaseURL !== 'string') {
    throw new Error('Playwright baseURL is required for the Chrome extension E2E.');
  }
  if (!INTERNAL_COMMAND_TOKEN) {
    throw new Error('BROWSER_AUTOMATION_INTERNAL_TOKEN is required for the Chrome extension E2E.');
  }

  const username = `playwright-chrome-extension-${Date.now()}`;
  const password = 'chrome-extension-e2e-password';
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@example.com`,
      name: 'Chrome Extension E2E User',
      passwordHash: await hashPassword(password),
    },
  });
  const extensionPath = path.resolve('chrome-extensions/browser-automation');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(
      testInfo.outputPath('chrome-extension-profile'),
      {
        channel: 'chromium',
        headless: true,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--proxy-bypass-list=<-loopback>',
        ],
      },
    );
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const extensionId = new URL(serviceWorker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('Server URL').fill(rawBaseURL);
    await popup.getByRole('button', { name: 'Save' }).click();

    const appPage = await context.newPage();
    await appPage.goto(new URL('/auth/signin', rawBaseURL).toString());
    await appPage.getByLabel('Username').fill(username);
    await appPage.getByLabel('Password').fill(password);
    await appPage.getByRole('button', { name: 'Log in' }).click();
    await expect(appPage).toHaveURL(/\/chat$/);
    await expect(appPage.getByRole('heading', { name: '招聘 AI Chat' })).toBeVisible();

    await expect
      .poll(async () => {
        await popup.getByRole('button', { name: 'Refresh' }).click();
        return popup.locator('#state').textContent();
      })
      .toBe('connected');
    await popup.close();
    await appPage.bringToFront();

    let commandSequence = 0;
    const sendCommand = async (action: 'snapshot_structured' | 'resolve_target') => {
      commandSequence += 1;
      const command = {
        id: `chrome-extension-e2e-${commandSequence}`,
        taskId: 'chrome-extension-e2e',
        stepId: action,
        action,
        target:
          action === 'resolve_target'
            ? { kind: 'button', role: 'button', name: '新建会话', exact: true }
            : undefined,
        params: action === 'resolve_target' ? { options: { action: 'click' } } : {},
        timeoutMs: 10_000,
      };
      const response = await request.post(
        new URL('/api/browser-automation/command', rawBaseURL).toString(),
        {
          headers: { 'x-browser-automation-internal-token': INTERNAL_COMMAND_TOKEN },
          data: { userId: user.id, command, timeoutMs: command.timeoutMs },
        },
      );
      expect(response.ok()).toBe(true);
      return response.json();
    };

    await expect
      .poll(
        async () => {
          const result = (await sendCommand('snapshot_structured')) as { success?: boolean };
          return result.success;
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    const snapshot = (await sendCommand('snapshot_structured')) as {
      success: boolean;
      domSnapshot?: {
        url: string;
        headings: Array<{ accessibleName?: string }>;
      };
    };
    expect(snapshot).toMatchObject({
      success: true,
      domSnapshot: { url: new URL('/chat', rawBaseURL).toString() },
    });
    expect(snapshot.domSnapshot?.headings).toEqual(
      expect.arrayContaining([expect.objectContaining({ accessibleName: '招聘 AI Chat' })]),
    );

    const resolution = (await sendCommand('resolve_target')) as {
      success: boolean;
      match?: { status?: string; chosen?: { accessibleName?: string } };
    };
    expect(resolution).toMatchObject({
      success: true,
      match: {
        status: 'unique',
        chosen: { accessibleName: '新建会话' },
      },
    });
  } finally {
    try {
      await context?.close();
    } finally {
      await prisma.$transaction([
        prisma.session.deleteMany({ where: { userId: user.id } }),
        prisma.user.deleteMany({ where: { id: user.id } }),
      ]);
    }
  }
});
