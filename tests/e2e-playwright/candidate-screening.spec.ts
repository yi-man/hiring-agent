import { expect, test } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'hiring-agent.session';
const SEEDED_USER_EMAIL = 'playwright-candidate-screening@example.com';
const SEEDED_USERNAME = 'playwright-candidate-screening';
const SEEDED_USER_NAME = 'Candidate Screening E2E User';
const SEEDED_PASSWORD_HASH = 'pbkdf2_sha256$fixture';
const SEEDED_SESSION_TOKEN = 'playwright-candidate-screening-session';
const SEEDED_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const HAS_DB_ENV = Boolean(
  process.env.DATABASE_URL ||
  (process.env.POSTGRES_HOST &&
    process.env.POSTGRES_PORT &&
    process.env.POSTGRES_USER &&
    process.env.POSTGRES_DATABASE),
);

async function seedSessionToken() {
  const user = await prisma.user.upsert({
    where: { email: SEEDED_USER_EMAIL },
    update: {
      username: SEEDED_USERNAME,
      passwordHash: SEEDED_PASSWORD_HASH,
      name: SEEDED_USER_NAME,
    },
    create: {
      username: SEEDED_USERNAME,
      passwordHash: SEEDED_PASSWORD_HASH,
      email: SEEDED_USER_EMAIL,
      name: SEEDED_USER_NAME,
    },
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
  await prisma.user.deleteMany({ where: { id: userId } });
}

test.describe('candidate screening UI', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    test.skip(!HAS_DB_ENV, 'Requires POSTGRES_* or DATABASE_URL in env (see .env.local).');
  });

  test('published JD links to candidate screening results and starts an execution run', async ({
    context,
    page,
  }, testInfo) => {
    const seeded = await seedSessionToken();

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

    try {
      await page.route('**/api/jd/jd-screening-1', async (route) => {
        await route.fulfill({
          json: {
            jobDescription: {
              id: 'jd-screening-1',
              userId: seeded.userId,
              department: '技术部',
              position: '高级后端工程师',
              positionDescription: '负责 Java 微服务',
              tone: 'tech',
              status: 'published',
              content: {
                title: '高级后端工程师',
                summary: '负责核心系统',
                responsibilities: ['建设 Java 微服务'],
                requirements: ['Java'],
                bonus: [],
                highlights: [],
              },
              evaluation: null,
              generationMeta: null,
              createdAt: '2026-06-29T00:00:00.000Z',
              updatedAt: '2026-06-29T00:00:00.000Z',
            },
          },
        });
      });
      await page.route('**/api/jd/jd-screening-1/publish', async (route) => {
        await route.fulfill({ json: { tasks: [] } });
      });
      await page.route('**/api/jd/jd-screening-1/candidate-screening/runs', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 202,
            json: {
              run: {
                id: 'run-1',
                userId: seeded.userId,
                jobDescriptionId: 'jd-screening-1',
                platform: 'boss-like',
                mode: 'execution',
                status: 'pending',
                currentStage: 'planning',
                searchPlan: null,
                evaluationSchema: null,
                stats: null,
                errorMessage: null,
                startedAt: null,
                finishedAt: null,
                createdAt: '2026-06-29T00:00:00.000Z',
                updatedAt: '2026-06-29T00:00:00.000Z',
              },
            },
          });
          return;
        }
        await route.fulfill({ json: { runs: [] } });
      });

      await page.goto('/jd-generator/jd-screening-1');
      const startScreeningButton = page.getByRole('button', {
        name: '筛选并执行',
        exact: true,
      });
      await expect(startScreeningButton).toBeVisible();
      await expect(page.getByRole('button', { name: '已筛选候选人', exact: true })).toHaveAttribute(
        'href',
        '/jd-generator/jd-screening-1/candidates',
      );

      await startScreeningButton.click();

      await expect(page.getByText(/筛选任务 run-1/)).toBeVisible();
      await expect(page.getByRole('link', { name: '查看筛选结果' })).toHaveAttribute(
        'href',
        '/jd-generator/jd-screening-1/candidates',
      );
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
