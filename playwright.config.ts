import { defineConfig, devices } from '@playwright/test';
import { loadRepoEnv } from './tests/e2e-playwright/load-repo-env';

loadRepoEnv(process.cwd());

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

/**
 * 真实 LLM E2E：不设 OPENAI_API_KEY 时 jd-generator-real 用例会 skip。
 * webServer 显式 NODE_ENV=development，避免继承 NODE_ENV=test 导致 JD 走 mock。
 */
export default defineConfig({
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'PORT=3100 pnpm dev',
    url: 'http://127.0.0.1:3100',
    /** 本地若已有 PORT=3100 的 dev（或 .next 锁被占用），复用实例；CI 始终自拉起 */
    reuseExistingServer: !isGithubActions,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  },
});
