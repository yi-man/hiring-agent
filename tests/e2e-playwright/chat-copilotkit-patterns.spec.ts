import { expect, test } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const SESSION_COOKIE_NAME = 'hiring-agent.session';
const SEEDED_USER_EMAIL = 'playwright-copilotkit-patterns@example.com';
const SEEDED_USERNAME = 'playwright-copilotkit-patterns';
const SEEDED_USER_NAME = 'CopilotKit Pattern User';
const SEEDED_PASSWORD_HASH = 'pbkdf2_sha256$fixture';
const SEEDED_SESSION_TOKEN = 'playwright-copilotkit-patterns-session';
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
  await prisma.message.deleteMany({ where: { conversation: { userId } } });
  await prisma.conversation.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test.describe('Chat CopilotKit pattern demos', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    test.skip(!HAS_DB_ENV, 'Requires POSTGRES_* or DATABASE_URL in env (see .env.local).');
  });

  test('covers the full nine-pattern manual validation checklist', async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(420_000);
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

    const sendMessage = async (text: string) => {
      await page.getByPlaceholder('发消息…').fill(text);
      await page.getByRole('button', { name: '发送' }).click();
      await page.waitForTimeout(200);
    };

    const switchPattern = async (name: string) => {
      await page.getByRole('button', { name }).click();
      await expect(page.getByRole('button', { name })).toBeVisible();
    };

    try {
      await page.goto('/chat-copilotkit', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(page.getByRole('button', { name: '新建会话' })).toBeVisible();
      await page.getByRole('button', { name: '新建会话' }).click();

      await switchPattern('Basic Streaming Chat');
      await sendMessage('请给我一个三点招聘建议');
      await expect(page.getByText('分析结论').first()).toBeVisible({ timeout: 60_000 });

      await switchPattern('Memory Persistence');
      await sendMessage('记住我们在招高级前端工程师');
      await sendMessage('基于刚才岗位再给面试要点');
      await expect(page.getByText('队列待处理').first()).toBeVisible();
      await expect(page.getByText('Memory 快照')).toBeVisible({ timeout: 60_000 });

      await switchPattern('RAG over Uploaded Doc');
      await page
        .getByLabel('上传 Markdown')
        .setInputFiles('tests/e2e-playwright/fixtures/sample-chat.md');
      await expect(page.getByText('sample-chat.md').first()).toBeVisible({ timeout: 60_000 });
      await sendMessage('概括文档里 Sample 一节');

      await switchPattern('Source Grounding');
      await sendMessage('请输出结论并给来源');
      await expect(page.getByText('Source Grounding').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('checkpoint_created').first()).toBeVisible({ timeout: 60_000 });

      await switchPattern('Tool Calling');
      await sendMessage('请帮我找 Golang 候选人');
      await expect(page.getByText('tool_call_start').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('tool_call_result').first()).toBeVisible({ timeout: 60_000 });

      await switchPattern('Agent Trace Stream');
      await sendMessage('输出 agent 执行轨迹');
      await expect(page.getByRole('button', { name: '断线重连' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: '断线重连' }).click();
      await expect(page.getByText('run_end').first()).toBeVisible({ timeout: 60_000 });

      await switchPattern('Structured Output');
      await sendMessage('给我结构化筛选结果');
      await expect(page.getByText('Structured Output').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('structured_output').first()).toBeVisible({ timeout: 60_000 });

      await switchPattern('Human Approval Gate');
      await page.getByPlaceholder('发消息…').fill('请继续推进面试邀约');
      await page.getByRole('button', { name: '发送' }).click();
      await expect(page.getByRole('button', { name: '批准继续' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: '批准继续' }).click();
      await expect(page.getByText('approval_resolved').first()).toBeVisible({ timeout: 60_000 });

      await switchPattern('Error Recovery Retry');
      await page.getByPlaceholder('发消息…').fill('please fail once');
      await page.getByRole('button', { name: '发送' }).click();
      await expect(page.getByText('回复中断')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: '一键重试' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: '一键重试' }).click();
      await expect(page.getByText('已完成模式').first()).toBeVisible({ timeout: 60_000 });
    } finally {
      await cleanupSeededUser(seeded.userId);
    }
  });
});
