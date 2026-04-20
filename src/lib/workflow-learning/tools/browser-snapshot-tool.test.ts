import { _browserSnapshotToolTestOnly } from '@/lib/workflow-learning/tools/browser-snapshot-tool';

describe('browser-snapshot tool signal inference', () => {
  it('detects login and loading hints', () => {
    const text = '请登录后继续，页面加载中，请稍候';
    const signals = _browserSnapshotToolTestOnly.inferSignals({ text });
    expect(signals.looksLikeLoginPage).toBe(true);
    expect(signals.loading).toBe(true);
  });

  it('detects message-like page text', () => {
    const text = '这里是消息列表与聊天窗口';
    const signals = _browserSnapshotToolTestOnly.inferSignals({ text });
    expect(signals.looksLikeMessagePage).toBe(true);
  });

  it('detects login-like URL even when body text is sparse', () => {
    const signals = _browserSnapshotToolTestOnly.inferSignals({
      text: '欢迎回来',
      url: 'https://www.zhipin.com/web/user/?ka=header-login',
    });
    expect(signals.looksLikeLoginPage).toBe(true);
  });

  it('treats geek chat as message page from url alone', () => {
    const signals = _browserSnapshotToolTestOnly.inferSignals({
      text: '',
      url: 'https://www.zhipin.com/web/geek/chat',
    });
    expect(signals.looksLikeMessagePage).toBe(true);
  });

  it('classifies current page against target and login urls', () => {
    expect(
      _browserSnapshotToolTestOnly.classifyCurrentPage({
        currentUrl: 'https://www.zhipin.com/web/geek/chat',
        targetUrl: 'https://www.zhipin.com/web/geek/chat',
        loginUrl: 'https://www.zhipin.com/web/user/',
      }),
    ).toBe('target');

    expect(
      _browserSnapshotToolTestOnly.classifyCurrentPage({
        currentUrl: 'https://www.zhipin.com/web/user/',
        targetUrl: 'https://www.zhipin.com/web/geek/chat',
        loginUrl: 'https://www.zhipin.com/web/user/',
      }),
    ).toBe('login');
  });

  it('blocks same-origin navigation after auth probe marked turn as login-required', () => {
    expect(
      _browserSnapshotToolTestOnly.shouldBlockNavigationForTurn({
        requestedUrl: 'https://www.zhipin.com/web/geek/chat',
        guard: { blockedOrigin: 'https://www.zhipin.com' },
      }),
    ).toBe(true);

    expect(
      _browserSnapshotToolTestOnly.shouldBlockNavigationForTurn({
        requestedUrl: 'https://example.com',
        guard: { blockedOrigin: 'https://www.zhipin.com' },
      }),
    ).toBe(false);
  });
});
