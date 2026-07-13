import {
  formatPublishAutomationError,
  formatPublishAutomationErrorText,
  stripAutomationNoise,
} from './format-error';

describe('formatPublishAutomationError', () => {
  it('maps connection refused to a friendly tip about boss-like', () => {
    const raw =
      'open new job page failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:6183/employer/jobs/new\nCall log:\n\u001b[2m  - navigating to "http://localhost:6183/employer/jobs/new"\u001b[22m\n';

    const formatted = formatPublishAutomationError(raw);
    expect(formatted.summary).toContain('无法连接本地 BOSS 模拟站');
    expect(formatted.summary).toContain('6183');
    expect(formatted.hint).toMatch(/make dev/);
    expect(formatted.technical).toContain('ERR_CONNECTION_REFUSED');
    expect(formatted.technical).not.toMatch(/\u001b/);
    expect(formatted.technical).not.toContain('Call log:');
  });

  it('returns a single-line text helper for storage and lists', () => {
    const text = formatPublishAutomationErrorText(
      'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:6183/employer/jobs/new',
    );
    expect(text).toContain('无法连接本地 BOSS 模拟站');
    expect(text).toContain('make dev');
  });

  it('strips ansi noise', () => {
    expect(stripAutomationNoise('hello\u001b[2m world\u001b[22m')).toBe('hello world');
  });

  it('handles empty input', () => {
    expect(formatPublishAutomationError(null).summary).toBe('发布失败，请稍后重试。');
  });
});
