/**
 * @jest-environment node
 */
import { PlaywrightBrowserExecutor, resolveHeadlessOption } from './playwright-executor';

describe('PlaywrightBrowserExecutor', () => {
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

  it('returns a bounded DOM snapshot for diagnostics', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <main>
              <label>职位名称</label>
              <input type="text" value="高级前端工程师" />
            </main>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const snapshot = await executor.snapshot();

      expect(snapshot).toContain('职位名称');
      expect(snapshot.length).toBeLessThanOrEqual(8_000);
    } finally {
      await executor.close();
    }
  });
});
