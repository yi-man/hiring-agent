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
      await page.route(/\/api\/jd\?status=published$/, async (route) => {
        await route.fulfill({
          json: {
            jobDescriptions: [
              {
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
                screeningSummary: {
                  status: 'not_started',
                  totalCandidateCount: 0,
                  qualifiedCandidateCount: 0,
                  latestRunId: null,
                  latestRunStatus: null,
                  latestRunUpdatedAt: null,
                },
                createdAt: '2026-06-29T00:00:00.000Z',
                updatedAt: '2026-06-29T00:00:00.000Z',
              },
            ],
            total: 1,
          },
        });
      });
      const communicationRun = {
        id: 'comm-run-1',
        userId: seeded.userId,
        jobDescriptionId: null,
        candidateId: null,
        platform: 'boss-like',
        mode: 'batch',
        status: 'success',
        stats: {
          total: 3,
          selected: 2,
          processed: 2,
          failed: 0,
          passes: 3,
          records: [
            {
              candidateId: 'cand-1',
              candidateName: 'Ada Lovelace',
              status: 'success',
              detail: '已处理未读消息',
            },
          ],
        },
        errorMessage: null,
        startedAt: '2026-06-29T00:00:00.000Z',
        finishedAt: '2026-06-29T00:02:00.000Z',
        createdAt: '2026-06-29T00:00:00.000Z',
        updatedAt: '2026-06-29T00:02:00.000Z',
      };
      let communicationRunPayload: unknown = null;
      await page.route('**/api/candidate-conversations/runs', async (route) => {
        expect(route.request().method()).toBe('POST');
        communicationRunPayload = route.request().postDataJSON();
        expect(communicationRunPayload).toMatchObject({
          mode: 'batch',
          platform: 'boss-like',
          maxPasses: 10,
        });
        expect(communicationRunPayload).not.toHaveProperty('jobDescriptionId');
        await route.fulfill({
          status: 202,
          json: { run: communicationRun },
        });
      });
      await page.route('**/api/candidate-conversations/runs/comm-run-1', async (route) => {
        await route.fulfill({ json: { run: communicationRun } });
      });
      await page.route('**/api/jd/jd-screening-1/candidate-screening/runs', async (route) => {
        if (route.request().method() === 'POST') {
          expect(route.request().postDataJSON()).toMatchObject({
            platform: 'boss-like',
            mode: 'execution',
          });
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
                skillId: null,
                workflow: null,
                currentWorkflowStep: null,
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
      await page.route('**/api/candidate-screening/runs/run-1', async (route) => {
        await route.fulfill({
          json: {
            run: {
              id: 'run-1',
              userId: seeded.userId,
              jobDescriptionId: 'jd-screening-1',
              platform: 'boss-like',
              mode: 'execution',
              status: 'success',
              currentStage: 'finalizing',
              skillId: 'screen-candidates-v2',
              workflow: { name: 'screen_candidates', version: 2 },
              currentWorkflowStep: null,
              searchPlan: null,
              evaluationSchema: null,
              stats: {
                fetched: 0,
                deduped: 0,
                stored: 0,
                vectorRecalled: 0,
                evaluated: 0,
                recommendedChat: 0,
                recommendedCollect: 0,
                skipped: 0,
                failed: 0,
              },
              errorMessage: null,
              startedAt: '2026-06-29T00:00:00.000Z',
              finishedAt: '2026-06-29T00:02:00.000Z',
              createdAt: '2026-06-29T00:00:00.000Z',
              updatedAt: '2026-06-29T00:02:00.000Z',
            },
          },
        });
      });
      await page.route('**/api/candidate-screening/runs/run-legacy-1', async (route) => {
        await route.fulfill({
          json: {
            run: {
              id: 'run-legacy-1',
              userId: seeded.userId,
              jobDescriptionId: 'jd-screening-1',
              platform: 'boss-like',
              mode: 'execution',
              status: 'success',
              currentStage: 'finalizing',
              skillId: null,
              workflow: null,
              currentWorkflowStep: null,
              searchPlan: null,
              evaluationSchema: null,
              stats: {
                fetched: 0,
                deduped: 0,
                stored: 0,
                vectorRecalled: 0,
                evaluated: 0,
                recommendedChat: 0,
                recommendedCollect: 0,
                skipped: 0,
                failed: 0,
              },
              errorMessage: null,
              startedAt: '2026-06-29T00:00:00.000Z',
              finishedAt: '2026-06-29T00:02:00.000Z',
              createdAt: '2026-06-29T00:00:00.000Z',
              updatedAt: '2026-06-29T00:02:00.000Z',
            },
          },
        });
      });
      await page.route(
        /\/api\/jd\/jd-screening-1\/candidates\?runId=(?:run-1|run-legacy-1)&limit=100$/,
        async (route) => {
          await route.fulfill({ json: { candidates: [] } });
        },
      );

      await page.goto('/jd-generator/jd-screening-1');
      const startScreeningButton = page.getByRole('button', {
        name: '筛选并执行',
        exact: true,
      });
      await expect(startScreeningButton).toBeVisible();
      await expect(page.getByRole('link', { name: '已筛选候选人', exact: true })).toHaveAttribute(
        'href',
        '/jd-generator/jd-screening-1/candidates?returnTo=%2Fjd-generator%2Fjd-screening-1&returnLabel=%E8%BF%94%E5%9B%9E+JD',
      );

      await startScreeningButton.click();

      await expect(page).toHaveURL(
        /\/jd-generator\/jd-screening-1\/screening-runs\/run-1\?returnTo=/,
      );
      await expect(page.getByText('筛选执行日志')).toBeVisible();
      await expect(page.getByText('筛选浏览器 Workflow')).toBeVisible();
      await expect(page.getByText('screen_candidates · v2')).toBeVisible();
      await expect(page.getByText('当前步骤：等待浏览器操作')).toBeVisible();
      await expect(page.getByRole('link', { name: '查看 Workflow 详情' })).toHaveAttribute(
        'href',
        '/workflows/screen-candidates-v2',
      );
      await expect(page.getByRole('button', { name: '全部候选人' })).toHaveAttribute(
        'href',
        '/jd-generator/jd-screening-1/candidates?returnTo=%2Fjd-generator%2Fjd-screening-1%2Fscreening-runs%2Frun-1%3FreturnTo%3D%252Fjd-generator%252Fjd-screening-1%26returnLabel%3D%25E8%25BF%2594%25E5%259B%259E%2BJD&returnLabel=%E8%BF%94%E5%9B%9E%E7%AD%9B%E9%80%89%E8%AE%B0%E5%BD%95',
      );

      await page.goto('/jd-generator/jd-screening-1/screening-runs/run-legacy-1');
      await expect(page.getByText('历史任务未关联 Workflow')).toBeVisible();
      await expect(page.getByRole('link', { name: '查看 Workflow 详情' })).toHaveCount(0);

      await page.goto('/jd-generator');
      await page.getByRole('button', { name: '批量沟通', exact: true }).click();

      expect(communicationRunPayload).toMatchObject({
        mode: 'batch',
        platform: 'boss-like',
        maxPasses: 10,
      });
      expect(communicationRunPayload).not.toHaveProperty('jobDescriptionId');
      await expect(page.getByText('沟通执行日志')).toBeVisible();
      await expect(page.getByText('批量沟通').first()).toBeVisible();
      await expect(page.getByText('2 条已处理')).toBeVisible();
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
