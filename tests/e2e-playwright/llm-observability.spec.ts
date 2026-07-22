import { expect, test } from '@playwright/test';

test.describe('LLM Observability dashboard', () => {
  test('renders dashboard sections and supports filter-driven requests', async ({ page }) => {
    await page.route('**/api/llm-stats/overview*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          overview: {
            today: {
              totalCalls: 12,
              successCalls: 11,
              errorCalls: 1,
              errorRate: 1 / 12,
              inputTokens: 1200,
              outputTokens: 800,
              totalTokens: 2000,
              avgLatencyMs: 180,
            },
            week: {
              totalCalls: 60,
              successCalls: 54,
              errorCalls: 6,
              errorRate: 0.1,
              inputTokens: 6000,
              outputTokens: 4200,
              totalTokens: 10200,
              avgLatencyMs: 210,
            },
            total: {
              totalCalls: 320,
              successCalls: 300,
              errorCalls: 20,
              errorRate: 20 / 320,
              inputTokens: 32000,
              outputTokens: 21000,
              totalTokens: 53000,
              avgLatencyMs: 240,
            },
          },
        }),
      });
    });

    await page.route('**/api/llm-stats/trend*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          points: [
            {
              bucketStart: '2026-03-25T00:00:00.000Z',
              totalCalls: 10,
              totalTokens: 1500,
              errorCalls: 1,
              avgLatencyMs: 210,
            },
            {
              bucketStart: '2026-03-26T00:00:00.000Z',
              totalCalls: 12,
              totalTokens: 1800,
              errorCalls: 2,
              avgLatencyMs: 220,
            },
          ],
        }),
      });
    });

    await page.route('**/api/llm-stats/errors*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            totalCalls: 60,
            totalErrors: 6,
            errorRate: 0.1,
          },
          distributions: {
            providers: [{ provider: 'openai', errorCalls: 6 }],
            models: [{ model: 'gpt-4o-mini', errorCalls: 6 }],
          },
          topErrorEndpoints: [
            { endpoint: '/api/jd/agent', errorCalls: 4 },
            { endpoint: '/api/chat', errorCalls: 2 },
          ],
          recentErrors: [],
        }),
      });
    });

    await page.route('**/api/llm-stats/logs*', async (route) => {
      const url = new URL(route.request().url());
      const provider = url.searchParams.get('provider');
      const onlyError = url.searchParams.get('onlyError');
      const filteredByOpenai = provider === 'openai';
      const onlyErrorEnabled = onlyError === 'true' || onlyError === '1';

      const items = [
        {
          id: 'log_ok_1',
          timestamp: '2026-03-26T10:00:00.000Z',
          endpoint: '/api/chat',
          provider: 'openai',
          model: 'gpt-4o-mini',
          latencyMs: 220,
          totalTokens: 320,
          isError: false,
          errorCode: null,
        },
        {
          id: 'log_err_1',
          timestamp: '2026-03-26T10:05:00.000Z',
          endpoint: '/api/jd/agent',
          provider: 'openai',
          model: 'gpt-4.1',
          latencyMs: 420,
          totalTokens: 850,
          isError: true,
          errorCode: 'rate_limit',
        },
      ];

      const filtered =
        filteredByOpenai && onlyErrorEnabled ? items.filter((item) => item.isError) : items;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          page: 1,
          limit: 20,
          total: filtered.length,
          hasMore: false,
          items: filtered,
        }),
      });
    });

    await page.goto('/llm-observability');

    await expect(page.getByRole('heading', { name: 'LLM Observability' })).toBeVisible();
    await expect(
      page.getByText('Overview, trends, errors, and call logs for LLM traffic.'),
    ).toBeVisible();

    await expect(page.getByText('Today')).toBeVisible();
    await expect(page.getByText('Week')).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();

    await expect(page.getByPlaceholder('openai')).toBeVisible();
    await expect(page.getByPlaceholder('gpt-4o-mini')).toBeVisible();
    await expect(page.getByText('Only errors')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Errors' })).toBeVisible();
    await expect(page.getByText('By provider')).toBeVisible();
    await expect(page.getByText('Top endpoints')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
    await expect(page.getByTestId('ok-row')).toBeVisible();
    await expect(page.getByTestId('error-row')).toBeVisible();

    const logsRequestPromise = page.waitForRequest((req) => {
      if (!req.url().includes('/api/llm-stats/logs?')) return false;
      const reqUrl = new URL(req.url());
      return (
        reqUrl.searchParams.get('provider') === 'openai' &&
        reqUrl.searchParams.get('onlyError') === 'true'
      );
    });

    await page.getByPlaceholder('openai').fill('openai');
    await page.getByLabel('Only errors').click();
    await logsRequestPromise;
    await expect(page).toHaveURL(/provider=openai/);
    await expect(page).toHaveURL(/onlyError=true/);
  });
});
