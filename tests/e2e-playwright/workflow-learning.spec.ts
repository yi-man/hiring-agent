import { expect, test } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'next-auth.session-token';
const SEEDED_USER_EMAIL = 'playwright-workflow-learning@example.com';
const SEEDED_USER_NAME = 'Workflow Learning E2E User';
const SEEDED_SESSION_TOKEN = 'playwright-workflow-learning-session';
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
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test.describe('Workflow Learning（真实 LLM + 服务端 Playwright）', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    test.skip(
      !HAS_DB_ENV,
      '需要 .env 中配置 MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASS/MYSQL_DATABASE（与本地真实库一致）。',
    );
    test.skip(
      !process.env.OPENAI_API_KEY?.trim(),
      '需要 OPENAI_API_KEY：本用例真实调用模型与 /api/workflow-learning/chat（无 mock）。',
    );
  });

  test('登录后发送任务，可见执行轨迹、工具结果与最终回答', async ({ context, page }, testInfo) => {
    test.setTimeout(900_000);

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

    /** 与 playwright.config 一致：E2E 应用跑在 3100；健康检查 JSON 含 ok:true */
    const userPrompt =
      '请使用 browser_snapshot 工具打开 http://127.0.0.1:3100/api/health ，用一句话说明响应 JSON 里是否有 ok 字段。';

    try {
      await page.goto('/workflow-learning', { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await expect(page.getByRole('heading', { name: 'Workflow Learning' })).toBeVisible();
      await expect(page.getByLabel('Workflow Learning 任务输入')).toBeVisible();

      const streamPromise = page.waitForResponse(
        (r) => r.url().includes('/api/workflow-learning/chat') && r.request().method() === 'POST',
        { timeout: 600_000 },
      );

      await page.getByLabel('Workflow Learning 任务输入').fill(userPrompt);
      await page.getByRole('button', { name: '发送' }).click();

      const streamResp = await streamPromise;
      expect(
        streamResp.ok(),
        `stream failed: HTTP ${streamResp.status()} ${(await streamResp.text().catch(() => '')).slice(0, 500)}`,
      ).toBeTruthy();

      await expect(page.getByText('执行轨迹', { exact: true })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText('工具 · browser_snapshot', { exact: true })).toBeVisible({
        timeout: 120_000,
      });
      /** browser_snapshot 返回 JSON；访问 /api/health 时 excerpt 中含接口 JSON 或 ok 标记 */
      await expect(
        page
          .locator('pre')
          .filter({ hasText: /\{"ok":true\}|api\/health|"ok"/ })
          .first(),
      ).toBeVisible({ timeout: 120_000 });

      await expect(page.getByText('回答', { exact: true })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText('请求失败')).toHaveCount(0);

      /** 输入为空时「发送」会因 !input.trim() 保持 disabled；以「执行中…」消失表示流结束 */
      await expect(page.getByText('执行中…')).toHaveCount(0, { timeout: 120_000 });

      const answerBody = page
        .getByText('回答', { exact: true })
        .locator('xpath=following-sibling::div[1]');
      await expect(answerBody).toBeVisible({ timeout: 120_000 });
      const answerText = (await answerBody.innerText()).trim();
      expect(answerText.length, `answer too short: ${JSON.stringify(answerText)}`).toBeGreaterThan(
        4,
      );
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
