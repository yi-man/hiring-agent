import { defineConfig, devices } from '@playwright/test';
import { loadRepoEnv } from './tests/e2e-playwright/load-repo-env';

loadRepoEnv(process.cwd());

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER !== 'false';

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
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    /** 本机已 `pnpm dev` 时复用；CI 无服务时会自动拉起 */
    reuseExistingServer,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  },
});
