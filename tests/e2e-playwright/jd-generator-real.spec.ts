import { test, expect } from '@playwright/test';
import { loadRepoEnv } from './load-repo-env';

loadRepoEnv(process.cwd());

test.describe('JD 生成（真实上游 LLM）', () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.OPENAI_API_KEY?.trim(),
      '在 .env.local 中配置 OPENAI_API_KEY（且 JD_LLM_MOCK 不为 true）后运行；本用例会真实调用模型。',
    );
    test.skip(
      process.env.JD_LLM_MOCK === 'true',
      'JD_LLM_MOCK=true 时服务端走 mock，请改为 false 以验证真实链路。',
    );
  });

  test('从岗位描述生成可解析的 JD JSON', async ({ page }) => {
    await page.goto('/jd-generator/new');
    await page.getByLabel('部门').selectOption('技术部');
    await page.getByLabel('职位').selectOption('测试工程师');
    await page.getByLabel('职位说明').fill('负责 Web 端自动化与 Playwright 维护。');

    /** initial_generate 会多次调用上游，总耗时可能超过 3 分钟 */
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith('/api/jd') && r.request().method() === 'POST',
      { timeout: 600_000 },
    );
    await page.getByRole('button', { name: '生成并创建' }).click();
    const resp = await responsePromise;
    expect(resp.ok(), `HTTP ${resp.status()}`).toBeTruthy();
    const payload = (await resp.json()) as {
      jobDescription?: {
        content?: { title?: string; summary?: string; responsibilities?: string[] };
      };
      error?: string;
    };
    expect(payload.jobDescription, payload.error).toBeTruthy();

    await expect(page.getByLabel('岗位摘要')).toBeVisible({ timeout: 60_000 });
    const jd = payload.jobDescription?.content ?? {};
    expect(
      jd.title?.trim().length ||
        jd.summary?.trim().length ||
        (jd.responsibilities?.length ?? 0) > 0,
    ).toBeGreaterThan(0);
  });
});
