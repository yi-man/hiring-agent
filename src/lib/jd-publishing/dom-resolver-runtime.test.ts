/**
 * @jest-environment node
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('dom resolver runtime compatibility', () => {
  it('can evaluate browser-context DOM helpers when loaded through tsx', async () => {
    const script = `
      import { chromium } from 'playwright';
      import { createStructuredDomSnapshot } from './src/lib/jd-publishing/dom-resolver';

      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent('<main><form><label>用户名 <input name="username" /></label><label>密码 <input name="password" type="password" /></label><button>登录</button></form></main>');

        try {
          const snapshot = await createStructuredDomSnapshot(page);
          console.log(JSON.stringify({
            pageState: snapshot.pageState,
            fieldNames: snapshot.forms.flatMap((form) => form.fields.map((field) => field.name)),
          }));
        } finally {
          await browser.close();
        }
      })();
    `;

    const { stdout } = await execFileAsync('bunx', ['tsx', '-e', script], {
      cwd: process.cwd(),
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });

    expect(JSON.parse(stdout)).toEqual({
      pageState: 'login',
      fieldNames: ['username', 'password'],
    });
  }, 30_000);
});
