import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

const MANUAL_FLAG = process.env.BOSS_LOGIN_CHECK_MANUAL === 'true';
const BOSS_TARGET_URL = 'https://www.zhipin.com/web/geek/chat';
const BOSS_LOGIN_HINTS = ['登录', '扫码', '注册', '验证码', '请稍候'];
const BOSS_READY_HINTS = ['聊天', '消息', '沟通'];
const BOSS_STORAGE_STATE_FILE = path.resolve(
  process.cwd(),
  '.cache/boss-login-check-storage-state.json',
);

function detectBossState(input: { url: string; body: string }) {
  const url = input.url.toLowerCase();
  const body = input.body.toLowerCase();
  const loginRequired =
    url.includes('/web/user') ||
    url.includes('login') ||
    BOSS_LOGIN_HINTS.some((kw) => body.includes(kw));
  const loggedIn =
    !loginRequired &&
    (url.includes('/web/geek/chat') || BOSS_READY_HINTS.some((kw) => body.includes(kw)));
  return { loginRequired, loggedIn };
}

test.use({
  launchOptions: {
    headless: false,
  },
});

test.describe('BOSS 登录态检查（手动）', () => {
  test.beforeEach(() => {
    test.skip(!MANUAL_FLAG, '手动登录检查默认关闭；设置 BOSS_LOGIN_CHECK_MANUAL=true 后运行。');
  });

  test('检查当前是否已登录；未登录则等待用户扫码，已登录则结束', async ({ page, context }) => {
    test.setTimeout(15 * 60_000);

    await page.goto(BOSS_TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });

    const startedAt = Date.now();
    const timeoutMs = 10 * 60_000;
    let promptedForLogin = false;

    while (Date.now() - startedAt < timeoutMs) {
      const url = page.url();
      const body = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      const state = detectBossState({ url, body });

      if (state.loggedIn) {
        console.log(`[boss-login-check] 已登录，当前页面：${url}`);
        await fs.mkdir(path.dirname(BOSS_STORAGE_STATE_FILE), { recursive: true });
        await context.storageState({ path: BOSS_STORAGE_STATE_FILE });
        expect(state.loggedIn).toBe(true);
        return;
      }

      if (state.loginRequired && !promptedForLogin) {
        promptedForLogin = true;
        console.log(
          `[boss-login-check] 当前未登录，浏览器将保持打开。请在页面完成扫码登录：${url}`,
        );
      }

      await page.waitForTimeout(3_000);
    }

    throw new Error('Timeout waiting for BOSS login completion. Please scan QR in browser window.');
  });
});
