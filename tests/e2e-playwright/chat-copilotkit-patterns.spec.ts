import { expect, test } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'next-auth.session-token';
const SEEDED_USER_EMAIL = 'playwright-copilotkit-patterns@example.com';
const SEEDED_USER_NAME = 'CopilotKit Pattern User';
const SEEDED_SESSION_TOKEN = 'playwright-copilotkit-patterns-session';
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

test.describe('Chat CopilotKit pattern demos', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    test.skip(!HAS_DB_ENV, 'Requires MYSQL_* in env (see .env.local).');
  });

  test('can run tool-calling demo and show timeline', async ({ context, page }, testInfo) => {
    test.setTimeout(240_000);
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

    try {
      await page.goto('/chat-copilotkit', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible();
      await page.getByRole('button', { name: '新建会话' }).click();
      await page.getByRole('button', { name: 'Tool Calling' }).click();
      await page.getByPlaceholder('发消息…').fill('请帮我找 Golang 候选人');
      await page.getByRole('button', { name: '发送' }).click();

      await expect(page.getByText('运行轨迹')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('tool_call_start').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('run_end').first()).toBeVisible({ timeout: 60_000 });
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
