import {
  extractBossLikeUnreadMessagesFromHtml,
  extractBossLikeUnreadMessagesFromRenderedHtml,
} from './boss-like';
import { BossLikeCandidateCommunicationAdapter } from './boss-like';
import type { BrowserExecutor } from '@/lib/browser/types';

describe('boss-like candidate communication adapter', () => {
  it('extracts only unread candidate messages from the inbox html', () => {
    const messages = extractBossLikeUnreadMessagesFromHtml(
      `<!doctype html>
      <main>
        <article data-message-id="msg-1" data-candidate-id="boss-cand-1" data-profile-url="/employer/resumes/boss-cand-1" data-unread="true">
          <h2>Ada Lovelace</h2>
          <p data-field="message">你好，还在招吗？</p>
          <time datetime="2026-06-30T12:00:00.000Z">刚刚</time>
        </article>
        <article data-message-id="msg-2" data-candidate-id="boss-cand-2" data-profile-url="/employer/resumes/boss-cand-2" data-unread="false">
          <h2>Grace Hopper</h2>
          <p data-field="message">已读消息</p>
        </article>
      </main>`,
      'http://127.0.0.1:6183',
    );

    expect(messages).toEqual([
      {
        externalMessageId: 'msg-1',
        platformCandidateId: 'boss-cand-1',
        candidateName: 'Ada Lovelace',
        profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
        content: '你好，还在招吗？',
        receivedAt: new Date('2026-06-30T12:00:00.000Z'),
      },
    ]);
  });

  it('extracts unread messages from the real rendered boss-like inbox html', () => {
    const messages = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<!doctype html>
      <main>
        <div class="overflow-y-auto">
          <div class="p-4 border-b cursor-pointer">
            <div class="font-medium">xxwade</div>
            <div class="text-xs text-gray-500">产品经理 · 小红书</div>
            <p class="text-sm text-gray-600 truncate flex-1">[Resume] Wade Resume</p>
          </div>
          <div class="p-4 border-b cursor-pointer">
            <div class="font-medium">xxwade</div>
            <div class="text-xs text-gray-500">游戏开发工程师 · 米哈游</div>
            <p class="text-sm text-gray-600 truncate flex-1">hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。</p>
            <span class="ml-2 bg-red-500 text-white text-xs rounded-full">1</span>
          </div>
        </div>
      </main>`,
      `<!doctype html>
      <main>
        <a href="/employer/resumes/201">
          <article data-candidate-id="201" data-profile-url="/employer/resumes/201">
            <h2>Wade</h2>
            <p data-field="company">xxwade</p>
            <p data-field="resume">Unity 商业化项目。技能：Unity、TypeScript。</p>
          </article>
        </a>
      </main>`,
      'http://localhost:6183',
    );

    expect(messages).toEqual([
      {
        externalMessageId: 'rendered-row:2',
        platformCandidateId: '201',
        candidateName: 'Wade',
        profileUrl: 'http://localhost:6183/employer/resumes/201',
        content: 'hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。',
        receivedAt: expect.any(Date),
        platformJobTitle: '游戏开发工程师',
        replyTarget: {
          browserThreadSelector: [
            'main div[class*="overflow-y-auto"] > div[class*="cursor-pointer"]',
            ':has-text("xxwade")',
            ':has-text("游戏开发工程师")',
            ':has-text("hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。")',
          ].join(''),
          sourceMessageId: 'rendered-row:2',
        },
      },
    ]);
  });

  it('lists unread messages through browser snapshots without direct platform API calls', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(() => {
      throw new Error('direct platform API calls are not allowed');
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    let currentUrl = '';
    const executor: BrowserExecutor = {
      navigate: jest.fn(async (url: string) => {
        currentUrl = url;
        return { success: true };
      }),
      fill: jest.fn(),
      click: jest.fn(),
      waitForUrl: jest.fn(),
      check: jest.fn().mockResolvedValue(true),
      snapshot: jest.fn(async () =>
        currentUrl.endsWith('/employer/resumes')
          ? `<article data-candidate-id="201" data-profile-url="/employer/resumes/201">
              <h2>Wade</h2>
              <p data-field="company">xxwade</p>
              <p data-field="resume">Unity 商业化项目</p>
            </article>`
          : `<main>
              <div class="overflow-y-auto">
                <div class="p-4 border-b cursor-pointer">
                  <div class="font-medium">xxwade</div>
                  <div class="text-xs text-gray-500">游戏开发工程师 · 米哈游</div>
                  <p>hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。</p>
                  <span class="ml-2 bg-red-500 text-white text-xs rounded-full">1</span>
                </div>
              </div>
            </main>`,
      ),
      close: jest.fn(),
    };

    try {
      const adapter = new BossLikeCandidateCommunicationAdapter({
        baseUrl: 'http://localhost:6183',
        username: 'admin',
        password: 'boss123',
        executor,
      });

      const messages = await adapter.listUnreadMessages();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        platformCandidateId: '201',
        candidateName: 'Wade',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not fail when a browser unread row disappears after replying', async () => {
    let currentUrl = '';
    const executor: BrowserExecutor = {
      navigate: jest.fn(async (url: string) => {
        currentUrl = url;
        return { success: true };
      }),
      fill: jest.fn(),
      click: jest.fn(),
      waitForUrl: jest.fn(),
      check: jest.fn(async (check) =>
        check.type === 'text_contains' && check.text === '消息列表' ? true : false,
      ),
      snapshot: jest.fn(async () => (currentUrl.endsWith('/employer/messages') ? '<main />' : '')),
      clickSelector: jest.fn(async () => ({
        success: false,
        error: 'selector not found',
      })),
      close: jest.fn(),
    };
    const adapter = new BossLikeCandidateCommunicationAdapter({
      baseUrl: 'http://localhost:6183',
      username: 'admin',
      password: 'boss123',
      executor,
    });

    await expect(
      adapter.markUnreadMessageProcessed({
        externalMessageId: 'rendered-row:1',
        platformCandidateId: '201',
        candidateName: 'Wade',
        profileUrl: 'http://localhost:6183/employer/resumes/201',
        content: '你好',
        receivedAt: new Date('2026-06-30T12:00:00.000Z'),
        replyTarget: {
          browserThreadSelector:
            'main div[class*="overflow-y-auto"] > div[class*="cursor-pointer"]:nth-of-type(1)',
          sourceMessageId: 'rendered-row:1',
        },
      }),
    ).resolves.toBeUndefined();
    expect(executor.clickSelector).not.toHaveBeenCalled();
  });

  it('lists read conversation rows when the latest visible message is still from the candidate', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() => {
      throw new Error('direct platform API calls are not allowed');
    }) as unknown as typeof fetch;
    let currentUrl = '';
    let selectedThread: 'list' | 'wade-product' | 'answered' = 'list';
    const executor: BrowserExecutor = {
      navigate: jest.fn(async (url: string) => {
        currentUrl = url;
        selectedThread = 'list';
        return { success: true };
      }),
      fill: jest.fn(),
      click: jest.fn(),
      waitForUrl: jest.fn(),
      check: jest.fn().mockResolvedValue(true),
      clickSelector: jest.fn(async (selector: string) => {
        selectedThread = selector.includes('产品经理') ? 'wade-product' : 'answered';
        return { success: true };
      }),
      snapshot: jest.fn(async () => {
        if (currentUrl.endsWith('/employer/resumes')) {
          return `<article data-candidate-id="201" data-profile-url="/employer/resumes/201">
            <h2>Wade</h2>
            <p data-field="company">xxwade</p>
            <p data-field="resume">Unity 商业化项目</p>
          </article>
          <article data-candidate-id="101" data-profile-url="/employer/resumes/101">
            <h2>Ada Lovelace</h2>
            <p data-field="company">Analytical Engines</p>
            <p data-field="resume">Java PostgreSQL</p>
          </article>`;
        }
        const listHtml = `<main>
          <div class="overflow-y-auto">
            <div class="p-4 border-b cursor-pointer">
              <div class="font-medium">Ada Lovelace</div>
              <div class="text-xs text-gray-500">高级后端工程师 · Analytical Engines</div>
              <p>感谢关注，我们稍后反馈。</p>
            </div>
            <div class="p-4 border-b cursor-pointer">
              <div class="font-medium">xxwade</div>
              <div class="text-xs text-gray-500">产品经理 · 小红书</div>
              <p>[Resume] Wade's Resume</p>
            </div>
          </div>`;
        if (selectedThread === 'wade-product') {
          return `${listHtml}
            <section>
              <div class="flex justify-start"><div><p>hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。</p></div></div>
              <div class="flex justify-end"><div><p>可以</p></div></div>
              <div class="flex justify-start"><div><a>[Resume] Wade's Resume</a><p>2026/6/25 09:48:43</p></div></div>
            </section>
          </main>`;
        }
        if (selectedThread === 'answered') {
          return `${listHtml}
            <section>
              <div class="flex justify-start"><div><p>你好</p></div></div>
              <div class="flex justify-end"><div><p>感谢关注，我们稍后反馈。</p></div></div>
            </section>
          </main>`;
        }
        return `${listHtml}</main>`;
      }),
      close: jest.fn(),
    };

    try {
      const adapter = new BossLikeCandidateCommunicationAdapter({
        baseUrl: 'http://localhost:6183',
        username: 'admin',
        password: 'boss123',
        executor,
      });

      const messages = await adapter.listUnreadMessages();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        platformCandidateId: '201',
        candidateName: 'Wade',
        platformJobTitle: '产品经理',
        content: "[Resume] Wade's Resume",
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not let the final rendered inbox row bleed into the conversation detail pane', () => {
    const messages = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<!doctype html>
      <main>
        <div class="overflow-y-auto">
          <div class="p-4 border-b cursor-pointer">
            <div class="font-medium">xxwade</div>
            <div class="text-xs text-gray-500">产品经理 · 小红书</div>
            <p>[Resume] Wade's Resume</p>
            <span class="ml-2 bg-red-500 text-white text-xs rounded-full">1</span>
          </div>
        </div>
        <div class="flex-1 flex flex-col">
          <h3>candidate_1</h3>
          <p>高级前端工程师 · 字节跳动</p>
        </div>
      </main>`,
      `<!doctype html>
      <main>
        <article data-candidate-id="201" data-profile-url="/employer/resumes/201">
          <h2>Wade</h2>
          <p data-field="company">xxwade</p>
          <p data-field="resume">Unity 商业化项目</p>
        </article>
      </main>`,
      'http://localhost:6183',
    );

    expect(messages[0]).toMatchObject({
      content: "[Resume] Wade's Resume",
      replyTarget: {
        browserThreadSelector: expect.stringContaining('[Resume] Wade'),
      },
    });
  });

  it('collects a minimal candidate from a browser message when no profile url is available', async () => {
    const adapter = new BossLikeCandidateCommunicationAdapter({
      baseUrl: 'http://localhost:6183',
      username: 'admin',
      password: 'boss123',
      executor: {
        navigate: jest.fn(),
        fill: jest.fn(),
        click: jest.fn(),
        waitForUrl: jest.fn(),
        check: jest.fn(),
        close: jest.fn(),
      },
    });

    await expect(
      adapter.collectCandidateFromMessage({
        externalMessageId: 'rendered-row:8',
        candidateName: 'xxwade',
        platformJobTitle: '产品经理',
        content: "[Resume] Wade's Resume",
        receivedAt: new Date('2026-06-25T09:48:43.000Z'),
      }),
    ).resolves.toEqual({
      platformCandidateId: null,
      profileUrl: null,
      name: 'xxwade',
      title: '产品经理',
      resumeText: "[Resume] Wade's Resume",
      lastActiveAt: '2026-06-25T09:48:43.000Z',
    });
  });
});
