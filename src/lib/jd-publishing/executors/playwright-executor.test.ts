/**
 * @jest-environment node
 */
import {
  isRouteContextDisposedError,
  PlaywrightBrowserExecutor,
  resolveHeadlessOption,
  shouldProxyApiRequest,
} from './playwright-executor';

describe('PlaywrightBrowserExecutor', () => {
  it('only proxies root API requests and leaves frontend modules alone', () => {
    expect(shouldProxyApiRequest('http://localhost:6183/api/auth/login')).toBe(true);
    expect(shouldProxyApiRequest('http://localhost:6183/src/api/index.ts')).toBe(false);
  });

  it('recognizes route errors caused by browser context shutdown', () => {
    expect(isRouteContextDisposedError(new Error('route.fetch: Request context disposed.'))).toBe(
      true,
    );
    expect(isRouteContextDisposedError(new Error('route.fetch: ECONNREFUSED'))).toBe(false);
  });

  it('defaults to a headed browser unless headless mode is explicitly requested', () => {
    expect(resolveHeadlessOption(undefined)).toBe(false);
    expect(resolveHeadlessOption(false)).toBe(false);
    expect(resolveHeadlessOption(true)).toBe(true);
  });

  it('waits for a delayed form input that follows a text label', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <div id="root"></div>
            <script>
              setTimeout(() => {
                document.querySelector('#root').innerHTML =
                  '<label>职位名称 *</label><input type="text" />';
              }, 100);
            </script>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const result = await executor.fill('职位名称', '高级前端工程师');

      expect(result).toEqual({ success: true });
    } finally {
      await executor.close();
    }
  });

  it('waits while checking for delayed visible text', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <div id="root"></div>
            <script>
              setTimeout(() => {
                document.querySelector('#root').textContent = '职位名称';
              }, 100);
            </script>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const found = await executor.check({
        id: 'title_visible',
        type: 'text_contains',
        text: '职位名称',
        timeout: 1_000,
      });

      expect(found).toBe(true);
    } finally {
      await executor.close();
    }
  });

  it('clicks the matching button instead of earlier text with the same label fragment', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <h1>招聘端登录</h1>
            <button onclick="document.querySelector('#result').textContent = 'button clicked'">
              登录
            </button>
            <div id="result"></div>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const result = await executor.click('登录');

      expect(result).toEqual({ success: true });
      await expect(
        executor.check({ type: 'text_contains', text: 'button clicked', timeout: 500 }),
      ).resolves.toBe(true);
    } finally {
      await executor.close();
    }
  });
});
