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
          <div class="p-4 border-b cursor-pointer" data-message-id="message-201-2" onclick="document.querySelector('#selected-thread').textContent = 'boss-message-1'">
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
        externalMessageId: expect.stringMatching(/^rendered-message:[a-f0-9]{32}$/),
        platformCandidateId: '201',
        candidateName: 'Wade',
        profileUrl: 'http://localhost:6183/employer/resumes/201',
        content: 'hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。',
        receivedAt: expect.any(Date),
        platformJobTitle: '游戏开发工程师',
        replyTarget: {
          browserThreadSelector: `main div[class*="overflow-y-auto"] > div[class*="cursor-pointer"][onclick="document.querySelector('#selected-thread').textContent = 'boss-message-1'"]`,
          sourceMessageId: expect.stringMatching(/^rendered-message:[a-f0-9]{32}$/),
        },
      },
    ]);
    expect(messages[0]?.replyTarget?.sourceMessageId).toBe(messages[0]?.externalMessageId);
  });

  it('expands every unread message in one rendered thread with stable identities and times', () => {
    const messagesHtml = `<!doctype html>
      <main>
        <div class="overflow-y-auto">
          <div class="p-4 border-b cursor-pointer" data-message-id="message-201-2">
            <div class="font-medium">xxwade</div>
            <div class="text-xs text-gray-500">游戏开发工程师 · 米哈游</div>
            <p>第二条：可以聊聊</p>
            <span class="bg-red-500">2</span>
          </div>
        </div>
        <section>
          <div class="flex justify-start" data-message-id="message-201-1">
            <div><p>第一条：这是我的简历</p><time datetime="2026-07-20T09:00:00.000Z">09:00</time></div>
          </div>
          <div class="flex justify-start" data-message-id="message-201-2">
            <div><p>第二条：可以聊聊</p><time datetime="2026-07-20T09:01:00.000Z">09:01</time></div>
          </div>
        </section>
      </main>`;
    const resumesHtml = `<article data-candidate-id="201" data-profile-url="/employer/resumes/201">
      <h2>Wade</h2><p data-field="company">xxwade</p>
    </article>`;

    const first = extractBossLikeUnreadMessagesFromRenderedHtml(
      messagesHtml,
      resumesHtml,
      'http://localhost:6183',
    );
    const replay = extractBossLikeUnreadMessagesFromRenderedHtml(
      messagesHtml,
      resumesHtml,
      'http://localhost:6183',
    );
    const explicitUnread = extractBossLikeUnreadMessagesFromRenderedHtml(
      messagesHtml
        .replace('<span class="bg-red-500">2</span>', '<span class="bg-red-500">1</span>')
        .replaceAll('class="flex justify-start"', 'class="flex justify-start" data-unread="true"'),
      resumesHtml,
      'http://localhost:6183',
    );

    expect(first).toHaveLength(2);
    expect(first.map((message) => message.content)).toEqual([
      '第一条：这是我的简历',
      '第二条：可以聊聊',
    ]);
    expect(first.map((message) => message.receivedAt)).toEqual([
      new Date('2026-07-20T09:00:00.000Z'),
      new Date('2026-07-20T09:01:00.000Z'),
    ]);
    expect(new Set(first.map((message) => message.externalMessageId)).size).toBe(2);
    expect(replay.map((message) => message.externalMessageId)).toEqual(
      first.map((message) => message.externalMessageId),
    );
    expect(explicitUnread.map((message) => message.content)).toEqual([
      '第一条：这是我的简历',
      '第二条：可以聊聊',
    ]);
    expect(new Set(first.map((message) => message.replyTarget?.browserThreadSelector)).size).toBe(
      1,
    );
  });

  it('fails closed when a rendered unread count cannot be fully expanded', () => {
    const messages = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main>
        <div class="overflow-y-auto">
          <div class="cursor-pointer" data-message-id="message-201-2">
            <div class="font-medium">xxwade</div><div class="text-xs">后端工程师 · ACME</div>
            <p>第二条</p><span class="bg-red-500">2</span>
          </div>
        </div>
        <div class="flex justify-start" data-message-id="message-201-2">
          <div><p>第二条</p><time datetime="2026-07-20T09:01:00.000Z">09:01</time></div>
        </div>
      </main>`,
      `<article data-candidate-id="201"><h2>Wade</h2><p data-field="company">xxwade</p></article>`,
      'http://localhost:6183',
    );

    expect(messages).toEqual([]);
  });

  it('keeps rendered fallback message ids stable when inbox row positions change', () => {
    const resumesHtml = `<article data-candidate-id="201" data-profile-url="/employer/resumes/201">
      <h2>Wade</h2>
      <p data-field="company">xxwade</p>
      <p data-field="resume">Unity 商业化项目</p>
    </article>`;
    const unreadRow = `<div class="p-4 border-b cursor-pointer" data-message-id="message-201-1">
      <div class="font-medium">xxwade</div>
      <div class="text-xs text-gray-500">游戏开发工程师 · 米哈游</div>
      <p class="text-sm text-gray-600 truncate flex-1">你好，还在招聘吗？</p>
      <span class="ml-2 bg-red-500 text-white text-xs rounded-full">1</span>
    </div>`;
    const first = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">${unreadRow}</div></main>`,
      resumesHtml,
      'http://localhost:6183',
    );
    const moved = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">
        <div class="p-4 border-b cursor-pointer">
          <div class="font-medium">Other</div><p>已读</p>
        </div>
        ${unreadRow}
      </div></main>`,
      resumesHtml,
      'http://localhost:6183',
    );
    const otherCandidate = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">
        ${unreadRow
          .replaceAll('xxwade', 'Analytical Engines')
          .replace('message-201-1', 'message-202-1')}
      </div></main>`,
      `<article data-candidate-id="202" data-profile-url="/employer/resumes/202">
        <h2>Ada</h2><p data-field="company">Analytical Engines</p>
        <p data-field="resume">Java</p>
      </article>`,
      'http://localhost:6183',
    );

    expect(first).toHaveLength(1);
    expect(moved).toHaveLength(1);
    expect(otherCandidate).toHaveLength(1);
    expect(moved[0]?.externalMessageId).toBe(first[0]?.externalMessageId);
    expect(otherCandidate[0]?.externalMessageId).not.toBe(first[0]?.externalMessageId);
  });

  it('keeps a fallback message id stable when older conversation history is trimmed', () => {
    const resumesHtml = `<article data-candidate-id="201">
      <h2>Wade</h2><p data-field="company">xxwade</p>
    </article>`;
    const unreadRow = `<div class="cursor-pointer" data-thread-id="thread-201">
      <div class="font-medium">xxwade</div>
      <div class="text-xs">后端工程师 · ACME</div>
      <p>重复文本</p><span class="bg-red-500">1</span>
    </div>`;
    const latest = `<div class="flex justify-start">
      <p>重复文本</p><time datetime="2026-07-20T09:00:00.000Z">09:00</time>
    </div>`;
    const withOlderHistory = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">${unreadRow}</div>
        <div class="flex justify-start">
          <p>旧消息</p><time datetime="2026-07-20T08:00:00.000Z">08:00</time>
        </div>
        <div class="flex justify-end"><p>旧回复</p></div>
        ${latest}
      </main>`,
      resumesHtml,
      'http://localhost:6183',
    );
    const afterHistoryTrim = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">${unreadRow}</div>${latest}</main>`,
      resumesHtml,
      'http://localhost:6183',
    );

    expect(withOlderHistory).toHaveLength(1);
    expect(afterHistoryTrim[0]?.externalMessageId).toBe(withOlderHistory[0]?.externalMessageId);
  });

  it('fails closed when fallback occurrences share the same timestamp and content', () => {
    expect(() =>
      extractBossLikeUnreadMessagesFromRenderedHtml(
        `<main>
          <div class="overflow-y-auto">
            <div class="cursor-pointer" data-thread-id="thread-201">
              <div class="font-medium">xxwade</div>
              <div class="text-xs">后端工程师 · ACME</div>
              <p>重复文本</p><span class="bg-red-500">2</span>
            </div>
          </div>
          <div class="flex justify-start">
            <p>重复文本</p><time datetime="2026-07-20T09:00:00.000Z">09:00</time>
          </div>
          <div class="flex justify-start">
            <p>重复文本</p><time datetime="2026-07-20T09:00:00.000Z">09:00</time>
          </div>
        </main>`,
        `<article data-candidate-id="201"><h2>Wade</h2><p data-field="company">xxwade</p></article>`,
        'http://localhost:6183',
      ),
    ).toThrow('boss-like unread thread message identities collide');
  });

  it('uses distinct stable onclick selectors for threads with identical visible text', () => {
    const row = (threadId: string, messageId: string) =>
      `<div class="cursor-pointer" data-message-id="${messageId}" onclick="openThread('${threadId}')">
        <div class="font-medium">张伟</div>
        <div class="text-xs">后端工程师 · ACME</div>
        <p>你好</p><span class="bg-red-500">1</span>
      </div>`;
    const messages = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">
        ${row('thread-a', 'message-a')}${row('thread-b', 'message-b')}
      </div></main>`,
      `<article data-candidate-id="201"><h2>张伟</h2><p data-field="company">张伟</p></article>
       <article data-candidate-id="202"><h2>张伟</h2><p data-field="company">张伟</p></article>`,
      'http://localhost:6183',
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.replyTarget?.browserThreadSelector)).toEqual([
      expect.stringContaining(`[onclick="openThread('thread-a')"]`),
      expect.stringContaining(`[onclick="openThread('thread-b')"]`),
    ]);
  });

  it('fails closed when rendered threads cannot be uniquely located', () => {
    const row = (messageId: string) => `<div class="cursor-pointer" data-message-id="${messageId}">
      <div class="font-medium">张伟</div>
      <div class="text-xs">后端工程师 · ACME</div>
      <p>你好</p><span class="bg-red-500">1</span>
    </div>`;

    expect(() =>
      extractBossLikeUnreadMessagesFromRenderedHtml(
        `<main><div class="overflow-y-auto">${row('message-a')}${row('message-b')}</div></main>`,
        '',
        'http://localhost:6183',
      ),
    ).not.toThrow();

    expect(() =>
      extractBossLikeUnreadMessagesFromRenderedHtml(
        `<main><div class="overflow-y-auto">
          ${row('message-a').replace(' data-message-id="message-a"', '')}
          ${row('message-b').replace(' data-message-id="message-b"', '')}
        </div></main>`,
        '',
        'http://localhost:6183',
      ),
    ).toThrow('boss-like conversation thread selectors are not unique');
  });

  it('does not silently merge candidates with the same visible name and company', () => {
    const resumesHtml = `<main>
      <article data-candidate-id="201" data-profile-url="/employer/resumes/201">
        <h2>同名候选人</h2><p data-field="company">同一家公司</p>
      </article>
      <article data-candidate-id="202" data-profile-url="/employer/resumes/202">
        <h2>同名候选人</h2><p data-field="company">同一家公司</p>
      </article>
    </main>`;
    const row = (messageId?: string) => `<div class="p-4 border-b cursor-pointer"${
      messageId ? ` data-message-id="${messageId}"` : ''
    }>
      <div class="font-medium">同名候选人</div>
      <div class="text-xs text-gray-500">后端工程师 · 同一家公司</div>
      <p>你好，还在招聘吗？</p>
      <span class="bg-red-500">1</span>
    </div>`;

    const withPlatformIdentity = extractBossLikeUnreadMessagesFromRenderedHtml(
      `<main><div class="overflow-y-auto">${row('message-201-1')}${row(
        'message-202-1',
      )}</div></main>`,
      resumesHtml,
      'http://localhost:6183',
    );

    expect(() =>
      extractBossLikeUnreadMessagesFromRenderedHtml(
        `<main><div class="overflow-y-auto">${row()}${row()}</div></main>`,
        resumesHtml,
        'http://localhost:6183',
      ),
    ).toThrow('boss-like conversation thread selectors are not unique');
    expect(withPlatformIdentity).toHaveLength(2);
    expect(new Set(withPlatformIdentity.map((message) => message.externalMessageId)).size).toBe(2);
    expect(withPlatformIdentity.map((message) => message.platformCandidateId)).toEqual([
      null,
      null,
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
                <div class="p-4 border-b cursor-pointer" data-message-id="message-201-1">
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

  it('loads a multi-unread thread detail and returns every candidate occurrence in order', async () => {
    let currentUrl = '';
    let selected = false;
    const inbox = `<main>
      <div class="overflow-y-auto">
        <div class="cursor-pointer" data-thread-id="thread-201">
          <div class="font-medium">xxwade</div>
          <div class="text-xs">后端工程师 · ACME</div>
          <p>第二条</p><span class="bg-red-500">2</span>
        </div>
      </div>`;
    const executor: BrowserExecutor = {
      navigate: jest.fn(async (url: string) => {
        currentUrl = url;
        selected = false;
        return { success: true };
      }),
      fill: jest.fn(),
      click: jest.fn(),
      waitForUrl: jest.fn(),
      check: jest.fn().mockResolvedValue(true),
      clickSelector: jest.fn(async () => {
        selected = true;
        return { success: true };
      }),
      snapshot: jest.fn(async () => {
        if (currentUrl.endsWith('/employer/resumes')) {
          return `<article data-candidate-id="201"><h2>Wade</h2><p data-field="company">xxwade</p></article>`;
        }
        return `${inbox}${
          selected
            ? `<section>
                <div class="flex justify-start" data-message-id="message-201-1">
                  <p>第一条</p><time datetime="2026-07-20T09:00:00.000Z">09:00</time>
                </div>
                <div class="flex justify-start" data-message-id="message-201-2">
                  <p>第二条</p><time datetime="2026-07-20T09:01:00.000Z">09:01</time>
                </div>
              </section>`
            : ''
        }</main>`;
      }),
      close: jest.fn(),
    };
    const adapter = new BossLikeCandidateCommunicationAdapter({
      baseUrl: 'http://localhost:6183',
      username: 'admin',
      password: 'boss123',
      executor,
    });

    const messages = await adapter.listUnreadMessages();

    expect(messages.map((message) => message.content)).toEqual(['第一条', '第二条']);
    expect(messages.map((message) => message.receivedAt)).toEqual([
      new Date('2026-07-20T09:00:00.000Z'),
      new Date('2026-07-20T09:01:00.000Z'),
    ]);
    expect(executor.clickSelector).toHaveBeenCalledTimes(1);
    expect(new Set(messages.map((message) => message.externalMessageId)).size).toBe(2);
  });

  it('assigns a new fallback id when the same candidate later sends the same text again', async () => {
    let currentUrl = '';
    let selected = false;
    let occurrenceCount = 1;
    const inboxRow = `<div class="p-4 border-b cursor-pointer" onclick="document.querySelector('#selected-thread').textContent = 'boss-message-1'">
      <div class="font-medium">xxwade</div>
      <div class="text-xs text-gray-500">游戏开发工程师 · 米哈游</div>
      <p>你好，还在招聘吗？</p>
      <span class="bg-red-500">1</span>
    </div>`;
    const executor: BrowserExecutor = {
      navigate: jest.fn(async (url: string) => {
        currentUrl = url;
        selected = false;
        return { success: true };
      }),
      fill: jest.fn(),
      click: jest.fn(),
      waitForUrl: jest.fn(),
      check: jest.fn().mockResolvedValue(true),
      clickSelector: jest.fn(async () => {
        selected = true;
        return { success: true };
      }),
      snapshot: jest.fn(async () => {
        if (currentUrl.endsWith('/employer/resumes')) {
          return `<article data-candidate-id="201" data-profile-url="/employer/resumes/201">
            <h2>Wade</h2><p data-field="company">xxwade</p>
          </article>`;
        }
        const secondOccurrence =
          occurrenceCount === 2
            ? `<div class="flex justify-end"><div><p>还在招聘</p><p>2026-07-20T09:01:00.000Z</p></div></div>
               <div class="flex justify-start"><div><p>你好，还在招聘吗？</p><p>2026-07-20T09:02:00.000Z</p></div></div>`
            : '';
        return `<main><div class="overflow-y-auto">${inboxRow}</div>
          ${
            selected
              ? `<section><div class="flex justify-start"><div><p>你好，还在招聘吗？</p><p>2026-07-20T09:00:00.000Z</p></div></div>${secondOccurrence}</section>`
              : ''
          }
        </main>`;
      }),
      close: jest.fn(),
    };
    const adapter = new BossLikeCandidateCommunicationAdapter({
      baseUrl: 'http://localhost:6183',
      username: 'admin',
      password: 'boss123',
      executor,
    });

    const first = await adapter.listUnreadMessages();
    occurrenceCount = 2;
    const second = await adapter.listUnreadMessages();
    const repeatedRead = await adapter.listUnreadMessages();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.externalMessageId).not.toBe(first[0]?.externalMessageId);
    expect(repeatedRead[0]?.externalMessageId).toBe(second[0]?.externalMessageId);
  });

  it('keeps a detail-derived fallback id stable when the inbox row moves', async () => {
    let currentUrl = '';
    let selected = false;
    let moved = false;
    const targetRow = `<div class="p-4 border-b cursor-pointer" onclick="document.querySelector('#selected-thread').textContent = 'boss-message-1'">
      <div class="font-medium">xxwade</div>
      <div class="text-xs text-gray-500">游戏开发工程师 · 米哈游</div>
      <p>你好，还在招聘吗？</p><span class="bg-red-500">1</span>
    </div>`;
    const executor: BrowserExecutor = {
      navigate: jest.fn(async (url: string) => {
        currentUrl = url;
        selected = false;
        return { success: true };
      }),
      fill: jest.fn(),
      click: jest.fn(),
      waitForUrl: jest.fn(),
      check: jest.fn().mockResolvedValue(true),
      clickSelector: jest.fn(async () => {
        selected = true;
        return { success: true };
      }),
      snapshot: jest.fn(async () => {
        if (currentUrl.endsWith('/employer/resumes')) {
          return `<article data-candidate-id="201" data-profile-url="/employer/resumes/201">
            <h2>Wade</h2><p data-field="company">xxwade</p>
          </article>`;
        }
        const precedingRow = moved
          ? `<div class="p-4 border-b cursor-pointer" data-message-id="other-message-1">
              <div class="font-medium">Other</div><p>另一条消息</p>
              <span class="bg-red-500">1</span>
            </div>`
          : '';
        return `<main><div class="overflow-y-auto">${precedingRow}${targetRow}</div>
          ${
            selected
              ? `<section><div class="flex justify-start"><div><p>你好，还在招聘吗？</p><p>2026-07-20T09:00:00.000Z</p></div></div></section>`
              : ''
          }
        </main>`;
      }),
      close: jest.fn(),
    };
    const adapter = new BossLikeCandidateCommunicationAdapter({
      baseUrl: 'http://localhost:6183',
      username: 'admin',
      password: 'boss123',
      executor,
    });

    const first = await adapter.listUnreadMessages();
    moved = true;
    const second = await adapter.listUnreadMessages();
    const firstTarget = first.find((message) => message.candidateName === 'Wade');
    const movedTarget = second.find((message) => message.candidateName === 'Wade');

    expect(firstTarget).toBeDefined();
    expect(movedTarget?.externalMessageId).toBe(firstTarget?.externalMessageId);
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
          <div class="p-4 border-b cursor-pointer" data-message-id="message-201-resume" onclick="document.querySelector('#selected-thread').textContent = 'boss-message-1'">
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
        browserThreadSelector: expect.stringContaining('onclick='),
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
