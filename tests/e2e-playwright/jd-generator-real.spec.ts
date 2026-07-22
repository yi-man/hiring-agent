import { test, expect } from '@playwright/test';
import { upsertCompanyProfileForUser } from '../../src/lib/company-profile/repo';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'hiring-agent.session';
const SEEDED_USER_EMAIL = 'playwright-jd-generator@example.com';
const SEEDED_USERNAME = 'playwright-jd-generator';
const SEEDED_SESSION_TOKEN = 'playwright-jd-generator-session';
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
      passwordHash: 'pbkdf2_sha256$fixture',
      name: 'JD Generator E2E User',
    },
    create: {
      username: SEEDED_USERNAME,
      passwordHash: 'pbkdf2_sha256$fixture',
      email: SEEDED_USER_EMAIL,
      name: 'JD Generator E2E User',
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
  await upsertCompanyProfileForUser({
    userId: user.id,
    name: 'Playwright 招聘测试公司',
    supportedPlatforms: ['boss-like'],
    locations: [{ kind: 'remote', label: '远程', city: null, address: null }],
  });

  return { userId: user.id, sessionToken: SEEDED_SESSION_TOKEN };
}

async function cleanupSeededUser(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test.describe('JD 生成（真实上游 LLM）', () => {
  test.beforeEach(() => {
    test.skip(!HAS_DB_ENV, 'Requires POSTGRES_* or DATABASE_URL in env (see .env.local).');
    test.skip(
      !process.env.OPENAI_API_KEY?.trim(),
      '在 .env.local 中配置 OPENAI_API_KEY（且 JD_LLM_MOCK 不为 true）后运行；本用例会真实调用模型。',
    );
    test.skip(
      process.env.JD_LLM_MOCK === 'true',
      'JD_LLM_MOCK=true 时服务端走 mock，请改为 false 以验证真实链路。',
    );
  });

  test('从岗位描述生成可解析的 JD JSON', async ({ context, page }, testInfo) => {
    const seeded = await seedSessionToken();
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

    try {
      await page.goto('/jd-generator/new');
      await page.getByLabel('部门').selectOption('技术部');
      await page.getByLabel('职位', { exact: true }).selectOption('测试工程师');
      await page.getByLabel('职位说明').fill('负责 Web 端自动化与 Playwright 维护。');
      await page.getByLabel('薪资范围').selectOption('15-25K');
      await expect(page.getByLabel('公司名称')).toHaveValue('Playwright 招聘测试公司');
      await expect(page.getByRole('button', { name: '生成并创建' })).toBeEnabled();

      /** create-run 在后台执行 initial_generate，并由执行页轮询最终状态。 */
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith('/api/jd/create-runs') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '生成并创建' }).click();
      const resp = await responsePromise;
      expect(resp.ok(), `HTTP ${resp.status()}`).toBeTruthy();
      const payload = (await resp.json()) as {
        run?: { id?: string };
        error?: string;
      };
      expect(payload.run?.id, payload.error).toBeTruthy();

      await expect(page).toHaveURL(new RegExp(`/jd-generator/create-runs/${payload.run?.id}`));
      await expect(page.getByRole('heading', { name: 'JD 创建执行' })).toBeVisible();
      await expect(page.getByText('JD 已创建完成')).toBeVisible({ timeout: 600_000 });
      await page.getByRole('button', { name: '查看详情' }).click();

      const summary = page.getByLabel('岗位摘要');
      await expect(summary).toBeVisible({ timeout: 60_000 });
      await expect(summary).not.toHaveValue('');
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
