import { defineConfig, devices } from '@playwright/test';
import { loadRepoEnv } from './tests/e2e-playwright/load-repo-env';

loadRepoEnv(process.cwd());

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
/** 显式开启才复用 3100（例如已手动 pnpm dev）；默认 false 避免误判导致不拉起服务 */
const reuseDevServer = process.env.PLAYWRIGHT_REUSE_DEV_SERVER === 'true';

/**
 * 真实 LLM E2E：不设 OPENAI_API_KEY 时 jd-generator-real 用例会 skip。
 * webServer 显式 NODE_ENV=development，避免继承 NODE_ENV=test 导致 JD 走 mock。
 */
export default defineConfig({
  globalSetup: './tests/e2e-playwright/global-setup.ts',
  testDir: './tests/e2e-playwright',
  fullyParallel: false,
  forbidOnly: isGithubActions,
  retries: isGithubActions ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 600_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--proxy-bypass-list=<-loopback>'],
        },
      },
    },
  ],
  webServer: {
    /** 与 package.json `dev` 一致；若遇 .next 损坏或 dev 锁残留，先 `rm -rf .next` 再跑 E2E */
    command: 'NODE_ENV=development pnpm exec next dev --turbopack -p 3100',
    /** 轻量就绪（无 DB）；完整页面走用例里 page.goto */
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: reuseDevServer,
    timeout: 960_000,
    env: { ...process.env, NODE_ENV: 'development' },
  },
});
