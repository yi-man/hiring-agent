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
      const historicalRunBase = {
        userId: seeded.userId,
        jobDescriptionId: 'jd-screening-1',
        platform: 'boss-like',
        mode: 'execution',
        status: 'success',
        currentStage: 'finalizing',
        currentWorkflowStep: null,
        searchPlan: null,
        evaluationSchema: null,
        stats: null,
        errorMessage: null,
        startedAt: '2026-06-28T00:00:00.000Z',
        finishedAt: '2026-06-28T00:02:00.000Z',
        createdAt: '2026-06-28T00:00:00.000Z',
        updatedAt: '2026-06-28T00:02:00.000Z',
      };
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
        await route.fulfill({
          json: {
            runs: [
              {
                ...historicalRunBase,
                id: 'run-history-v2',
                skillId: 'screen-candidates-history-v2',
                workflow: { name: 'screen_candidates', version: 2 },
              },
              {
                ...historicalRunBase,
                id: 'run-history-legacy',
                skillId: null,
                workflow: null,
                createdAt: '2026-06-27T00:00:00.000Z',
                updatedAt: '2026-06-27T00:02:00.000Z',
              },
            ],
          },
        });
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
      await page.route('**/api/candidate-screening/runs/run-history-v2', async (route) => {
        await route.fulfill({
          json: {
            run: {
              ...historicalRunBase,
              id: 'run-history-v2',
              skillId: 'screen-candidates-history-v2',
              workflow: { name: 'screen_candidates', version: 2 },
            },
            events: [],
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
        /\/api\/jd\/jd-screening-1\/candidates\?runId=(?:run-1|run-history-v2|run-legacy-1)&limit=100$/,
        async (route) => {
          await route.fulfill({ json: { candidates: [] } });
        },
      );
      await page.route('**/api/jd/jd-screening-1/candidates?limit=100', async (route) => {
        await route.fulfill({
          json: {
            candidates: [
              {
                id: 'result-1',
                userId: seeded.userId,
                runId: 'run-history-v2',
                jobDescriptionId: 'jd-screening-1',
                candidateId: 'candidate-1',
                resumeId: null,
                source: 'live_search',
                tags: {
                  skills: ['Java'],
                  domainKnowledge: [],
                  generalAbility: [],
                  risk: [],
                  activity: [],
                  custom: [],
                },
                scoreDetail: {
                  skill: 88,
                  domain: 80,
                  ability: 86,
                  risk: 92,
                  llmBonus: 0,
                  total: 87,
                },
                finalScore: 87,
                rank: 1,
                decisionAction: 'chat',
                decisionPriority: 'high',
                decisionReason: 'Java 微服务经验匹配',
                actionPlan: null,
                actionStatus: 'success',
                interviewStage: 'contacted',
                notes: null,
                createdAt: '2026-06-28T00:01:00.000Z',
                updatedAt: '2026-06-28T00:02:00.000Z',
                candidate: {
                  id: 'candidate-1',
                  userId: seeded.userId,
                  displayName: 'Ada Lovelace',
                  currentTitle: '高级后端工程师',
                  currentCompany: 'Analytical Engines',
                  location: '上海',
                  experienceYears: 8,
                  sourcePlatform: 'boss-like',
                  platformCandidateId: 'ada-1',
                  profileUrl: null,
                  identityKey: 'ada-1',
                  identityHash: 'ada-hash',
                  lastActiveAt: null,
                  contacted: true,
                  replied: false,
                  lastContactAt: '2026-06-28T00:02:00.000Z',
                  createdAt: '2026-06-28T00:00:00.000Z',
                  updatedAt: '2026-06-28T00:02:00.000Z',
                },
                resume: null,
              },
            ],
          },
        });
      });

      await page.goto('/jd-generator/jd-screening-1');
      const startScreeningButton = page.getByRole('button', {
        name: '筛选并执行',
        exact: true,
      });
      await expect(startScreeningButton).toBeVisible();
      const topActions = page.getByLabel('JD 详情主操作');
      const screenedCandidatesLink = topActions.getByRole('link', {
        name: '已筛选候选人',
        exact: true,
      });
      await expect(screenedCandidatesLink).toHaveAttribute(
        'href',
        '/jd-generator/jd-screening-1/candidates?returnTo=%2Fjd-generator%2Fjd-screening-1&returnLabel=%E8%BF%94%E5%9B%9E+JD',
      );
      await expect(topActions.locator(':scope > *')).toHaveCount(2);
      await expect(page.getByRole('link', { name: /查看执行日志/ })).toHaveCount(0);

      await screenedCandidatesLink.click();

      await expect(page).toHaveURL(/\/jd-generator\/jd-screening-1\/candidates\?returnTo=/);
      await expect(page.getByRole('heading', { name: '已筛选候选人' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ada Lovelace' })).toBeVisible();
      await expect(page.getByLabel('分数范围')).toHaveValue('all');
      const screeningHistory = page.getByLabel('筛选记录');
      await expect(screeningHistory.getByText('2 次', { exact: true })).toBeVisible();
      await expect(screeningHistory.getByRole('link', { name: /查看执行日志/ })).toHaveCount(2);
      await expect(
        screeningHistory.getByRole('link', { name: 'screen_candidates v2' }),
      ).toHaveAttribute('href', /\/workflows\/screen-candidates-history-v2\?returnTo=/);
      await expect(screeningHistory.getByText('未关联 Workflow')).toBeVisible();
      const sourceRunLink = page.getByRole('link', { name: '来自第 2 次筛选' });
      await expect(sourceRunLink).toHaveAttribute(
        'href',
        /\/jd-generator\/jd-screening-1\/screening-runs\/run-history-v2\?returnTo=/,
      );

      await sourceRunLink.click();
      await expect(page.getByText('筛选执行日志')).toBeVisible();
      await page.getByRole('button', { name: '返回已筛选候选人' }).click();
      await expect(page.getByRole('heading', { name: '已筛选候选人' })).toBeVisible();

      await page.getByRole('button', { name: '返回 JD' }).click();
      await expect(page).toHaveURL('/jd-generator/jd-screening-1');

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
        /\/workflows\/screen-candidates-v2\?returnTo=/,
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

  test('renders every persisted browser-v2 segment with primitive steps', async ({
    context,
    page,
  }, testInfo) => {
    const seeded = await seedSessionToken();
    const workflowId = `screen-candidates-browser-v2-${Date.now()}`;
    const workflowVersion = 900_000 + (Date.now() % 10_000);
    const rawBaseURL = testInfo.project.use.baseURL;
    if (!rawBaseURL || typeof rawBaseURL !== 'string') {
      throw new Error('Playwright baseURL is required to set the seeded auth cookie by url.');
    }
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: seeded.sessionToken,
        url: new URL('/', rawBaseURL).toString(),
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await prisma.publishSkill.create({
      data: {
        id: workflowId,
        name: 'screen_candidates',
        platform: 'boss-like',
        description: 'Browser-v2 candidate screening workflow',
        version: workflowVersion,
        isActive: true,
        inputSchema: {},
        variables: {},
        steps: [
          {
            id: 'search_observe',
            type: 'action',
            action: 'observe',
            params: { format: 'html', saveAs: 'listHtml' },
            next: 'search_complete',
          },
          { id: 'search_complete', type: 'end' },
          {
            id: 'contact_open',
            type: 'action',
            action: 'navigate',
            params: { url: '{{input.profileUrl}}' },
            next: 'contact_complete',
          },
          { id: 'contact_complete', type: 'end' },
        ],
        meta: { dsl_version: 'browser-v2', created_from: 'explore' },
      },
    });

    try {
      await page.goto(`/workflows/${workflowId}`);

      await expect(page.getByText('search_observe · observe', { exact: true })).toBeVisible();
      await expect(page.getByText('contact_open · navigate', { exact: true })).toBeVisible();
      await expect(page.getByText('search_candidates', { exact: true })).toHaveCount(0);
      await expect(page.getByText('chat_candidate', { exact: true })).toHaveCount(0);
    } finally {
      await prisma.publishSkill.delete({ where: { id: workflowId } });
      await cleanupSeededUser(seeded.userId);
    }
  });
});
