import path from 'node:path';
import { expect, test } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'next-auth.session-token';
const SEEDED_USER_EMAIL = 'playwright-chat-doc-flow@example.com';
const SEEDED_USER_NAME = 'Chat Doc Flow User';
const SEEDED_SESSION_TOKEN = 'playwright-chat-doc-flow-session';
const SEEDED_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const HAS_DB_ENV = Boolean(
  process.env.MYSQL_HOST &&
  process.env.MYSQL_PORT &&
  process.env.MYSQL_USER &&
  process.env.MYSQL_PASS &&
  process.env.MYSQL_DATABASE,
);

async function seedSessionToken() {
  const user = await prisma.user.upsert({
    where: { email: SEEDED_USER_EMAIL },
    update: { name: SEEDED_USER_NAME },
    create: { email: SEEDED_USER_EMAIL, name: SEEDED_USER_NAME },
  });

  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.session.create({
    data: {
      sessionToken: SEEDED_SESSION_TOKEN,
      userId: user.id,
      expires: new Date(Date.now() + SEEDED_SESSION_MAX_AGE_MS),
    },
  });

  return { userId: user.id, sessionToken: SEEDED_SESSION_TOKEN };
}

async function cleanupSeededUser(userId: string) {
  await prisma.message.deleteMany({ where: { conversation: { userId } } });
  await prisma.conversation.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test.describe('Chat: new conversation, upload markdown, send message', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('completes flow without client error (stream mocked)', async ({
    context,
    page,
  }, testInfo) => {
    test.skip(!HAS_DB_ENV, 'Requires MYSQL_* in env (see .env.local).');

    const seeded = await seedSessionToken();

    const rawBaseURL = testInfo.project.use.baseURL;
    if (!rawBaseURL || typeof rawBaseURL !== 'string') {
      throw new Error('Playwright baseURL is required.');
    }
    const cookieUrl = new URL('/', rawBaseURL).toString();
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: seeded.sessionToken,
        url: cookieUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await page.route('**/api/conversations/*/messages/stream', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: 'E2E mock assistant reply',
      });
    });

    try {
      await page.goto('/chat');
      await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible();

      await page.getByRole('button', { name: '新建会话' }).click();

      const sampleMd = path.join(process.cwd(), 'tests/e2e-playwright/fixtures', 'sample-chat.md');
      await page.locator('#conversation-md-upload').setInputFiles(sampleMd);

      await expect(page.getByText('sample-chat.md').first()).toBeVisible({ timeout: 60_000 });

      await page.getByPlaceholder('输入你的问题').fill('你好，请确认链路');
      await page.getByRole('button', { name: '发送' }).click();

      await expect(page.getByText('E2E mock assistant reply')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('请求失败')).toHaveCount(0);
      await expect(page.getByText('document is not ready')).toHaveCount(0);
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
