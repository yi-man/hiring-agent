/**
 * @jest-environment node
 */
import { PlaywrightBrowserExecutor, resolveHeadlessOption } from './playwright-executor';
import type { BrowserExecutor, TargetDescriptor } from '@/lib/browser/types';

jest.setTimeout(20_000);

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

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          match: expect.objectContaining({ status: 'unique' }),
        }),
      );
    } finally {
      await executor.close();
    }
  });

  it('fills a structured target and returns a match report', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const target: TargetDescriptor = {
        kind: 'field',
        role: 'textbox',
        name: '职位名称',
        exact: true,
        stableAttrs: { name: 'title' },
        scope: { kind: 'form', name: '发布职位' },
      };
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <form aria-label="发布职位">
              <label>
                职位名称
                <input
                  name="title"
                  oninput="document.querySelector('#filled-value').textContent = this.value"
                />
              </label>
              <div id="filled-value"></div>
            </form>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const result = await executor.fill(target as never, '高级前端工程师');

      expect(result.success).toBe(true);
      expect(result.match).toEqual(
        expect.objectContaining({
          status: 'unique',
          candidateCount: 1,
          chosen: expect.objectContaining({ name: 'title' }),
        }),
      );
      await expect(
        executor.check({ type: 'text_contains', text: '高级前端工程师', timeout: 500 }),
      ).resolves.toBe(true);
    } finally {
      await executor.close();
    }
  });

  it('keeps the match report when a resolved fill action fails during execution', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const target: TargetDescriptor = {
        kind: 'field',
        role: 'textbox',
        name: '职位名称',
        exact: true,
        stableAttrs: { name: 'title' },
      };
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <form aria-label="发布职位">
              <label>
                职位名称
                <input name="title" type="file" />
              </label>
            </form>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const result = await executor.fill(target, '高级前端工程师');

      expect(result.success).toBe(false);
      expect(result.match).toEqual(
        expect.objectContaining({
          status: 'unique',
          target,
        }),
      );
      expect(result.failedTargetKey).toBe('target');
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

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          match: expect.objectContaining({ status: 'unique' }),
        }),
      );
      await expect(
        executor.check({ type: 'text_contains', text: 'button clicked', timeout: 500 }),
      ).resolves.toBe(true);
    } finally {
      await executor.close();
    }
  });

  it('fills and clicks Playwright selectors for browser-only conversation flows', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <main>
              <textarea placeholder="输入回复内容..."></textarea>
              <button type="button" onclick="document.querySelector('#sent').textContent = document.querySelector('textarea').value">
                发送
              </button>
              <div id="sent"></div>
            </main>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const fillResult = await executor.fillSelector?.(
        'textarea[placeholder="输入回复内容..."]',
        '你好，可以进一步聊聊',
      );
      const clickResult = await executor.clickSelector?.('button:has-text("发送")');

      expect(fillResult).toEqual({ success: true });
      expect(clickResult).toEqual({ success: true });
      await expect(
        executor.check({ type: 'text_contains', text: '你好，可以进一步聊聊', timeout: 500 }),
      ).resolves.toBe(true);
    } finally {
      await executor.close();
    }
  });

  it('refuses to click ambiguous duplicate structured buttons', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const target: TargetDescriptor = {
        kind: 'button',
        role: 'button',
        name: '发布职位',
        exact: true,
      };
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <button type="button">发布职位</button>
            <button type="button">发布职位</button>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const result = await executor.click(target as never);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ambiguous_target');
      expect(result.match).toEqual(
        expect.objectContaining({ status: 'ambiguous', candidateCount: 2 }),
      );
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
      expect(snapshot.length).toBeLessThanOrEqual(200_000);
    } finally {
      await executor.close();
    }
  });

  it('keeps candidate cards that appear after large app bootstrap markup', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const prefix = 'x'.repeat(12_000);
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <script type="application/json">${prefix}</script>
            <main>
              <article data-candidate-id="boss-1" data-profile-url="/employer/resumes/boss-1">
                <h2>王小明</h2>
                <p data-field="resume">Java 微服务 PostgreSQL</p>
              </article>
            </main>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const snapshot = await executor.snapshot();

      expect(snapshot).toContain('data-candidate-id="boss-1"');
      expect(snapshot).toContain('Java 微服务 PostgreSQL');
    } finally {
      await executor.close();
    }
  });

  it('returns a structured snapshot for explore and fallback diagnostics', async () => {
    const executor = new PlaywrightBrowserExecutor({ timeoutMs: 1_000, headless: true });
    try {
      const html = encodeURIComponent(`
        <!doctype html>
        <html>
          <body>
            <main>
              <h1>发布职位</h1>
              <form aria-label="发布职位">
                <label>职位名称 <input name="title" /></label>
                <label>公司名称 <input name="company" /></label>
                <label>薪资范围 <input name="salary" /></label>
                <label>工作地点 <input name="location" /></label>
                <label>职位描述 <textarea name="description"></textarea></label>
                <label>技能标签 <input name="keyword" /></label>
                <button type="button">发布职位</button>
              </form>
            </main>
          </body>
        </html>
      `);

      await executor.navigate(`data:text/html;charset=utf-8,${html}`);
      const snapshot = await (executor as BrowserExecutor).snapshotStructured?.();

      expect(snapshot).toEqual(
        expect.objectContaining({
          pageState: 'publish_form',
          forms: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({ name: 'title', label: '职位名称' }),
              ]),
            }),
          ]),
        }),
      );
    } finally {
      await executor.close();
    }
  });
});
