import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'next-auth.session-token';
const SEEDED_USER_EMAIL = 'playwright-workflow-boss-manual@example.com';
const SEEDED_USER_NAME = 'Workflow BOSS Manual E2E User';
const SEEDED_SESSION_TOKEN = 'playwright-workflow-boss-manual-session';
const SEEDED_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MANUAL_FLAG = process.env.WORKFLOW_BOSS_MANUAL_E2E === 'true';
const BOSS_STORAGE_STATE_FILE = path.resolve(
  process.cwd(),
  '.cache/workflow-learning-boss-storage-state.json',
);

const LOGIN_HINTS = ['请登录', '登录后', '未登录', '需要登录', '加载中，请稍候', '扫码'];
const BOSS_LOGIN_HINTS = ['登录', '扫码', '注册', '验证码', '请稍候'];

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

async function sendPromptAndGetAnswer(page: import('@playwright/test').Page, prompt: string) {
  await page.getByLabel('Workflow Learning 任务输入').fill(prompt);
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('执行中…')).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByText('回答', { exact: true }).last()).toBeVisible({ timeout: 120_000 });
  const answerBody = page
    .getByText('回答', { exact: true })
    .last()
    .locator('xpath=following-sibling::div[1]');
  await expect(answerBody).toBeVisible({ timeout: 60_000 });
  return (await answerBody.innerText()).trim();
}

async function waitForBossLoginReady(page: import('@playwright/test').Page) {
  await page.goto('https://www.zhipin.com/web/geek/chat', {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });

  const startedAt = Date.now();
  const timeoutMs = 8 * 60_000;
  // 自动轮询页面状态，用户扫码后会自然跳转到可用页面。
  while (Date.now() - startedAt < timeoutMs) {
    const url = page.url().toLowerCase();
    const body = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).toLowerCase();
    const looksLikeLoginPage =
      url.includes('/web/user') ||
      url.includes('login') ||
      BOSS_LOGIN_HINTS.some((kw) => body.includes(kw));
    const hasChatSignal =
      body.includes('聊天') || body.includes('消息') || url.includes('/web/geek/chat');
    if (!looksLikeLoginPage && hasChatSignal) {
      return;
    }
    await page.waitForTimeout(3_000);
  }
  throw new Error('Timeout waiting for BOSS login completion. Please scan QR in browser window.');
}

test.use({
  launchOptions: {
    headless: false,
  },
});

test.describe('Workflow Learning BOSS 手动登录真实链路', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    test.skip(!MANUAL_FLAG, '手动登录用例默认关闭；设置 WORKFLOW_BOSS_MANUAL_E2E=true 后运行。');
    test.skip(
      !process.env.OPENAI_API_KEY?.trim(),
      '需要 OPENAI_API_KEY：本用例真实调用模型与 /api/workflow-learning/chat。',
    );
  });

  test('workflow页面内触发BOSS页面，登录后可继续访问消息页', async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(15 * 60_000);
    const seeded = await seedSessionToken();
    const prompt = '打开boss直聘消息页，返回第一条消息';
    const workflowPage = page;
    const bossPage = await context.newPage();

    try {
      const rawBaseURL = testInfo.project.use.baseURL;
      if (!rawBaseURL || typeof rawBaseURL !== 'string')
        throw new Error('Playwright baseURL is required.');

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

      await workflowPage.goto('/workflow-learning', {
        waitUntil: 'domcontentloaded',
        timeout: 180_000,
      });
      await expect(workflowPage.getByRole('heading', { name: 'Workflow Learning' })).toBeVisible();
      await expect(workflowPage.getByLabel('Workflow Learning 任务输入')).toBeVisible();

      // 第一步：在独立页签打开 BOSS 并等待用户扫码登录
      await waitForBossLoginReady(bossPage);
      await fs.mkdir(path.dirname(BOSS_STORAGE_STATE_FILE), { recursive: true });
      await context.storageState({ path: BOSS_STORAGE_STATE_FILE });

      // 第二步：保留 workflow 页面不变，复用同一浏览器上下文中的登录状态执行任务
      await workflowPage.bringToFront();
      await expect(workflowPage.getByRole('heading', { name: 'Workflow Learning' })).toBeVisible();
      await expect(workflowPage.getByLabel('Workflow Learning 任务输入')).toBeVisible();

      let answer = await sendPromptAndGetAnswer(workflowPage, prompt);
      let attempt = 1;
      while (attempt < 6 && LOGIN_HINTS.some((kw) => answer.includes(kw))) {
        await workflowPage.waitForTimeout(15_000);
        answer = await sendPromptAndGetAnswer(workflowPage, prompt);
        attempt += 1;
      }

      expect(answer.length).toBeGreaterThan(4);
      expect(LOGIN_HINTS.some((kw) => answer.includes(kw))).toBeFalsy();
    } finally {
      await bossPage.close().catch(() => undefined);
      await cleanupSeededUser(seeded.userId);
    }
  });
});
