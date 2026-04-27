import { BrowserSessionManager } from './browser-session';

function createFakeChromium(
  pageState: {
    url: string;
    title: string;
    body: string;
    redirectTo?: string;
    selectorText?: Record<string, string>;
    selectorFirstText?: Record<string, string>;
    selectorInnerTextErrors?: string[];
  },
  options: { supportsPersistentContext?: boolean } = {},
) {
  const page = {
    goto: jest.fn(async (url: string) => {
      pageState.url = pageState.redirectTo ?? url;
    }),
    bringToFront: jest.fn(),
    title: jest.fn(async () => pageState.title),
    url: jest.fn(() => pageState.url),
    locator: jest.fn((selector: string) => ({
      innerText: jest.fn(async () => {
        if (selector === 'body') return pageState.body;
        if (pageState.selectorInnerTextErrors?.includes(selector)) {
          throw new Error(`Multiple elements matched selector: ${selector}`);
        }
        const selectorText = pageState.selectorText?.[selector];
        if (selectorText !== undefined) return selectorText;
        throw new Error(`Unknown selector: ${selector}`);
      }),
      first: jest.fn(() => ({
        innerText: jest.fn(async () => {
          const selectorText =
            pageState.selectorFirstText?.[selector] ?? pageState.selectorText?.[selector];
          if (selectorText !== undefined) return selectorText;
          throw new Error(`Unknown first selector: ${selector}`);
        }),
      })),
    })),
  };
  const context = {
    newPage: jest.fn(async () => page),
    pages: jest.fn(() => [page]),
    storageState: jest.fn(async () => ({ cookies: [], origins: [] })),
    close: jest.fn(),
  };
  const browser = {
    newContext: jest.fn(async () => context),
    close: jest.fn(),
  };
  const chromium = {
    launch: jest.fn(async () => browser),
    ...(options.supportsPersistentContext
      ? {
          launchPersistentContext: jest.fn(async () => context),
        }
      : {}),
  };

  return { chromium, browser, context, page };
}

describe('BrowserSessionManager', () => {
  it('reuses a browser session for repeated snapshots', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com',
      title: 'Example',
      body: 'Hello from the page',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/one' });
    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/two' });

    expect(fake.chromium.launch).toHaveBeenCalledTimes(1);
    expect(fake.browser.newContext).toHaveBeenCalledTimes(1);
    await manager.close('s1');
  });

  it('opens snapshots in a visible browser and reports whether the final url matches', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/login',
      title: 'Login',
      body: 'Please login',
      redirectTo: 'https://example.com/login',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    const result = await manager.snapshot({
      sessionId: 's1',
      url: 'https://example.com/messages',
    });

    expect(fake.chromium.launch).toHaveBeenCalledWith({ headless: false });
    expect(result).toMatchObject({
      requestedUrl: 'https://example.com/messages',
      url: 'https://example.com/login',
      urlMatchesRequested: false,
    });
    expect(fake.browser.close).not.toHaveBeenCalled();
    await manager.close('s1');
  });

  it('uses a persistent visible browser profile and shares it across sessions', async () => {
    const fake = createFakeChromium(
      {
        url: 'https://example.com',
        title: 'Example',
        body: 'Hello from the page',
      },
      { supportsPersistentContext: true },
    );
    const manager = new BrowserSessionManager({
      chromium: fake.chromium,
      userDataDir: '/tmp/workflow-learning-browser-profile',
    });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/one' });
    await manager.snapshot({ sessionId: 's2', url: 'https://example.com/two' });

    expect(fake.chromium.launchPersistentContext).toHaveBeenCalledTimes(1);
    expect(fake.chromium.launchPersistentContext).toHaveBeenCalledWith(
      '/tmp/workflow-learning-browser-profile',
      { headless: false },
    );
    expect(fake.context.newPage).toHaveBeenCalledTimes(1);
    expect(fake.page.bringToFront).toHaveBeenCalled();
    expect(fake.chromium.launch).not.toHaveBeenCalled();
    expect(fake.browser.newContext).not.toHaveBeenCalled();
    await manager.close('s1');
  });

  it('brings the workflow page to front after visible navigation', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com',
      title: 'Example',
      body: 'Hello from the page',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.navigate({ sessionId: 's1', url: 'https://example.com/messages' });

    expect(fake.page.bringToFront).toHaveBeenCalledTimes(1);
    await manager.close('s1');
  });

  it('detects login success from url and visible text', async () => {
    const pageState = {
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '消息列表',
    };
    const fake = createFakeChromium(pageState);
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });
    pageState.url = 'https://example.com/messages';
    const result = await manager.verifyLogin({
      sessionId: 's1',
      success: {
        urlNotIncludes: ['/login'],
        textIncludes: ['消息'],
      },
    });

    expect(result.loggedIn).toBe(true);
    await manager.close('s1');
  });

  it('detects login success when login text is absent', async () => {
    const pageState = {
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '消息列表',
    };
    const fake = createFakeChromium(pageState);
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });
    const result = await manager.inspectLogin({
      sessionId: 's1',
      success: {
        textNotIncludes: ['扫码登录'],
      },
    });

    expect(result.loggedIn).toBe(true);
    await manager.close('s1');
  });

  it('polls until login success criteria match', async () => {
    const pageState = {
      url: 'https://example.com/login',
      title: 'Login',
      body: '扫码登录',
    };
    const fake = createFakeChromium(pageState);
    const manager = new BrowserSessionManager({
      chromium: fake.chromium,
      loginPollIntervalMs: 1,
    });

    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });
    setTimeout(() => {
      pageState.url = 'https://example.com/messages';
      pageState.body = '消息列表';
    }, 5);

    const result = await manager.verifyLogin({
      sessionId: 's1',
      success: {
        urlNotIncludes: ['/login'],
        textIncludes: ['消息'],
      },
      timeoutMs: 100,
    });

    expect(result.loggedIn).toBe(true);
    await manager.close('s1');
  });

  it('reuses a visible snapshot session for login without closing the redirected page first', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com',
      title: 'Example',
      body: 'Login required',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });

    expect(fake.chromium.launch).toHaveBeenCalledTimes(1);
    expect(fake.chromium.launch).toHaveBeenNthCalledWith(1, { headless: false });
    expect(fake.browser.close).not.toHaveBeenCalled();
    await manager.close('s1');
  });

  it('does not verify login when success criteria are empty', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '消息列表',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });
    const result = await manager.verifyLogin({
      sessionId: 's1',
      success: {},
      timeoutMs: 1,
    });

    expect(result.loggedIn).toBe(false);
    await manager.close('s1');
  });

  it('does not oversleep the login timeout by the full poll interval', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/login',
      title: 'Login',
      body: '扫码登录',
    });
    const manager = new BrowserSessionManager({
      chromium: fake.chromium,
      loginPollIntervalMs: 50,
    });

    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });
    const startedAt = Date.now();
    const result = await manager.verifyLogin({
      sessionId: 's1',
      success: {
        urlNotIncludes: ['/login'],
        textIncludes: ['消息'],
      },
      timeoutMs: 5,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.loggedIn).toBe(false);
    expect(elapsedMs).toBeLessThan(40);
    await manager.close('s1');
  });

  it('checks login on the current page without navigating', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '消息列表 第一条消息',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    const result = await manager.inspectLogin({
      sessionId: 's1',
      success: { textIncludes: ['消息'] },
    });

    expect(result.loggedIn).toBe(true);
    expect(fake.page.goto).toHaveBeenCalledTimes(1);
    await manager.close('s1');
  });

  it('navigates an existing session and returns current page details', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com',
      title: 'Messages',
      body: '第一条消息：你好',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com' });
    const result = await manager.navigate({
      sessionId: 's1',
      url: 'https://example.com/messages',
    });

    expect(result).toMatchObject({
      sessionId: 's1',
      requestedUrl: 'https://example.com/messages',
      url: 'https://example.com/messages',
      title: 'Messages',
      excerpt: '第一条消息：你好',
      urlMatchesRequested: true,
    });
    expect(fake.chromium.launch).toHaveBeenCalledTimes(1);
    await manager.close('s1');
  });

  it('extracts visible text from the current page', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '第一条消息：你好，第二条消息：再见',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    const extracted = await manager.extractText({
      sessionId: 's1',
      selectorHint: 'first message item',
      maxChars: 8,
    });

    expect(extracted).toEqual({
      sessionId: 's1',
      text: '第一条消息：你好',
      url: 'https://example.com/messages',
    });
    await manager.close('s1');
  });

  it('extracts first message text from selector hints before falling back to body text', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '导航\n候选人：你好\n侧边栏',
      selectorText: {
        '[data-testid="message-list"] [data-testid="message-item"]': '候选人：你好',
      },
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    const extracted = await manager.extractText({
      sessionId: 's1',
      selectorHint: 'first message item',
    });

    expect(extracted).toEqual({
      sessionId: 's1',
      text: '候选人：你好',
      url: 'https://example.com/messages',
    });
    await manager.close('s1');
  });

  it('extracts the first matching message item when selector innerText has multiple matches', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '导航\n候选人：你好\n侧边栏',
      selectorFirstText: {
        '[data-testid="message-list"] [data-testid="message-item"]': '候选人：你好',
      },
      selectorInnerTextErrors: ['[data-testid="message-list"] [data-testid="message-item"]'],
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    const extracted = await manager.extractText({
      sessionId: 's1',
      selectorHint: 'first message item',
    });

    expect(extracted).toEqual({
      sessionId: 's1',
      text: '候选人：你好',
      url: 'https://example.com/messages',
    });
    await manager.close('s1');
  });

  it('waits for text on the current page', async () => {
    const pageState = {
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '加载中',
    };
    const fake = createFakeChromium(pageState);
    const manager = new BrowserSessionManager({
      chromium: fake.chromium,
      loginPollIntervalMs: 1,
    });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    setTimeout(() => {
      pageState.body = '消息列表';
    }, 5);

    const result = await manager.waitForText({
      sessionId: 's1',
      text: '消息',
      timeoutMs: 100,
    });

    expect(result.found).toBe(true);
    expect(result.url).toBe('https://example.com/messages');
    expect(result.excerpt).toBe('消息列表');
    await manager.close('s1');
  });

  it('does not oversleep the text wait timeout by the full poll interval', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com/messages',
      title: 'Messages',
      body: '加载中',
    });
    const manager = new BrowserSessionManager({
      chromium: fake.chromium,
      loginPollIntervalMs: 50,
    });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    const startedAt = Date.now();
    const result = await manager.waitForText({
      sessionId: 's1',
      text: '消息',
      timeoutMs: 5,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.found).toBe(false);
    expect(elapsedMs).toBeLessThan(40);
    await manager.close('s1');
  });
});
