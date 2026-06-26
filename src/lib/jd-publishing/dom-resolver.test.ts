/**
 * @jest-environment node
 */
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import {
  classifyStructuredSnapshot,
  createStructuredDomSnapshot,
  resolveTarget,
} from './dom-resolver';
import type { TargetDescriptor } from './types';

let browser: Browser;

async function withPage(
  html: string,
  fn: (page: Awaited<ReturnType<Browser['newPage']>>) => Promise<void>,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setContent(html);
    await fn(page);
  } finally {
    await page.close();
  }
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

describe('dom resolver', () => {
  it('resolves a unique field by stable name attribute', async () => {
    await withPage('<form><input name="title" aria-label="职位名称" /></form>', async (page) => {
      const target: TargetDescriptor = {
        kind: 'field',
        role: 'textbox',
        name: '职位名称',
        exact: true,
        stableAttrs: { name: 'title' },
      };

      const result = await resolveTarget(page, target, { action: 'fill' });

      expect(result.report).toEqual(
        expect.objectContaining({
          status: 'unique',
          strategy: 'stable_attr:name',
          candidateCount: 1,
        }),
      );
      expect(result.report.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.report.chosen).toEqual(
        expect.objectContaining({ tag: 'input', name: 'title', editable: true }),
      );
      expect(result.locator).toBeTruthy();
      await result.locator?.fill('高级前端工程师');
      await expect(page.locator('[name="title"]').inputValue()).resolves.toBe('高级前端工程师');
    });
  });

  it('resolves a unique button by role and accessible name', async () => {
    await withPage('<button type="button">发布职位</button>', async (page) => {
      const result = await resolveTarget(
        page,
        { kind: 'button', role: 'button', name: '发布职位', exact: true },
        { action: 'click' },
      );

      expect(result.report.status).toBe('unique');
      expect(result.report.strategy).toBe('role_name');
      expect(result.report.chosen).toEqual(
        expect.objectContaining({ tag: 'button', accessibleName: '发布职位' }),
      );
    });
  });

  it('resolves a field through label association', async () => {
    await withPage('<label for="salary">薪资范围</label><input id="salary" />', async (page) => {
      const result = await resolveTarget(
        page,
        { kind: 'field', name: '薪资范围', exact: true },
        { action: 'fill' },
      );

      expect(result.report.status).toBe('unique');
      expect(result.report.strategy).toBe('label');
      expect(result.report.chosen).toEqual(
        expect.objectContaining({ tag: 'input', id: 'salary', label: '薪资范围' }),
      );
    });
  });

  it('resolves a field through placeholder', async () => {
    await withPage('<input placeholder="工作地点" />', async (page) => {
      const result = await resolveTarget(
        page,
        { kind: 'field', name: '工作地点', exact: true },
        { action: 'fill' },
      );

      expect(result.report.status).toBe('unique');
      expect(result.report.strategy).toBe('placeholder');
      expect(result.report.chosen).toEqual(
        expect.objectContaining({ tag: 'input', placeholder: '工作地点' }),
      );
    });
  });

  it('refuses ambiguous equal-score candidates', async () => {
    await withPage(
      '<button type="button">发布职位</button><button type="button">发布职位</button>',
      async (page) => {
        const result = await resolveTarget(
          page,
          { kind: 'button', role: 'button', name: '发布职位', exact: true },
          { action: 'click' },
        );

        expect(result.locator).toBeNull();
        expect(result.report).toEqual(
          expect.objectContaining({
            status: 'ambiguous',
            strategy: 'role_name',
            candidateCount: 2,
          }),
        );
        expect(result.report.candidates).toHaveLength(2);
      },
    );
  });

  it('returns not_found when no candidate matches', async () => {
    await withPage('<main><button type="button">保存</button></main>', async (page) => {
      const result = await resolveTarget(
        page,
        { kind: 'button', role: 'button', name: '发布职位', exact: true },
        { action: 'click' },
      );

      expect(result.locator).toBeNull();
      expect(result.report).toEqual(
        expect.objectContaining({
          status: 'not_found',
          candidateCount: 0,
          confidence: 0,
        }),
      );
    });
  });

  it('prefers a scoped form candidate over a page-level duplicate', async () => {
    await withPage(
      `
        <form aria-label="发布职位">
          <label>职位名称 <input name="publish-title" /></label>
        </form>
        <form aria-label="搜索">
          <label>职位名称 <input name="search-title" /></label>
        </form>
      `,
      async (page) => {
        const result = await resolveTarget(
          page,
          {
            kind: 'field',
            role: 'textbox',
            name: '职位名称',
            exact: true,
            scope: { kind: 'form', name: '发布职位' },
          },
          { action: 'fill' },
        );

        expect(result.report.status).toBe('unique');
        expect(result.report.chosen).toEqual(expect.objectContaining({ name: 'publish-title' }));
      },
    );
  });

  it('builds a structured snapshot with page state', async () => {
    await withPage(
      `
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
      `,
      async (page) => {
        const snapshot = await createStructuredDomSnapshot(page);

        expect(classifyStructuredSnapshot(snapshot)).toBe('publish_form');
        expect(snapshot.pageState).toBe('publish_form');
        expect(snapshot.forms[0]?.name).toBe('发布职位');
        expect(snapshot.forms[0]?.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'title', label: '职位名称' }),
            expect.objectContaining({ name: 'description', label: '职位描述' }),
          ]),
        );
        expect(snapshot.forms[0]?.buttons).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ tag: 'button', accessibleName: '发布职位' }),
          ]),
        );
      },
    );
  });
});
