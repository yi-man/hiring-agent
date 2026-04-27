import { BrowserSessionManager } from './browser-session';

function createFakeChromium(pageState: { url: string; title: string; body: string }) {
  const page = {
    goto: jest.fn(async (url: string) => {
      pageState.url = url;
    }),
    title: jest.fn(async () => pageState.title),
    url: jest.fn(() => pageState.url),
    locator: jest.fn(() => ({
      innerText: jest.fn(async () => pageState.body),
    })),
  };
  const context = {
    newPage: jest.fn(async () => page),
    storageState: jest.fn(async () => ({ cookies: [], origins: [] })),
    close: jest.fn(),
  };
  const browser = {
    newContext: jest.fn(async () => context),
    close: jest.fn(),
  };
  const chromium = {
    launch: jest.fn(async () => browser),
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

  it('recreates a headless snapshot session as headed for login', async () => {
    const fake = createFakeChromium({
      url: 'https://example.com',
      title: 'Example',
      body: 'Login required',
    });
    const manager = new BrowserSessionManager({ chromium: fake.chromium });

    await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
    await manager.openLogin({ sessionId: 's1', loginUrl: 'https://example.com/login' });

    expect(fake.chromium.launch).toHaveBeenNthCalledWith(1, { headless: true });
    expect(fake.chromium.launch).toHaveBeenNthCalledWith(2, { headless: false });
    expect(fake.browser.close).toHaveBeenCalledTimes(1);
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
});
