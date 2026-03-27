import { expect, test } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'next-auth.session-token';
const SEEDED_USER_EMAIL = 'playwright-seeded-auth@example.com';
const SEEDED_USER_NAME = 'Playwright Seeded User';
const SEEDED_SESSION_TOKEN = 'playwright-seeded-session-token';
const SEEDED_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HAS_DB_ENV = Boolean(process.env.DATABASE_URL || process.env.MYSQL_URL);
const IS_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

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
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.message.deleteMany({ where: { conversation: { userId } } });
  await prisma.conversation.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test.describe('GitHub auth behavior', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('shows login entry for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' }).first()).toBeVisible();
  });

  test('blocks unauthenticated access to protected chat page', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText('请先登录后继续')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '新建会话' })).toHaveCount(0);
  });

  test('logout resets UI and protected API access is denied', async ({
    context,
    page,
  }, testInfo) => {
    if (!HAS_DB_ENV) {
      if (IS_CI) {
        throw new Error(
          'DATABASE_URL or MYSQL_URL is required in CI for seeded-session auth test reliability.',
        );
      }
      test.skip(
        true,
        'Local-only skip: DATABASE_URL/MYSQL_URL not configured for seeded session test.',
      );
    }

    const seeded = await seedSessionToken();

    try {
      const rawBaseURL = testInfo.project.use.baseURL;
      if (!rawBaseURL || typeof rawBaseURL !== 'string') {
        throw new Error('Playwright baseURL is required to set the seeded auth cookie by url.');
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

      await page.goto('/chat');
      await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
      await expect(page.getByText(SEEDED_USER_NAME)).toBeVisible();

      await page.getByRole('button', { name: 'Logout' }).click();
      await expect(page.getByRole('button', { name: 'Sign in with GitHub' }).first()).toBeVisible();
      await expect(page.getByText('请先登录后继续')).toBeVisible();

      const denied = await page.request.get('/api/conversations');
      expect(denied.status()).toBe(401);
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});

test.describe('GitHub live provider flow (manual)', () => {
  test.skip(
    process.env.PLAYWRIGHT_RUN_LIVE_GITHUB !== 'true',
    'Manual-only test. Set PLAYWRIGHT_RUN_LIVE_GITHUB=true to run against live GitHub OAuth.',
  );

  test('navigates to provider sign-in page when login is clicked', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Sign in with GitHub' }).first().click();
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
  });
});
