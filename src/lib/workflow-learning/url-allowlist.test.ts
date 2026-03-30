import { assertUrlAllowed } from './url-allowlist';

describe('assertUrlAllowed', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  const prevMode = process.env.WORKFLOW_TOOL_URL_ALLOWLIST_MODE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    delete process.env.WORKFLOW_TOOL_URL_ALLOWLIST_MODE;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prev;
    if (prevMode === undefined) {
      delete process.env.WORKFLOW_TOOL_URL_ALLOWLIST_MODE;
    } else {
      process.env.WORKFLOW_TOOL_URL_ALLOWLIST_MODE = prevMode;
    }
  });

  it('allows https://evil.example.com by default', () => {
    expect(() => assertUrlAllowed('https://evil.example.com')).not.toThrow();
  });

  it('allows http://127.0.0.1:3000/api/health', () => {
    expect(() => assertUrlAllowed('http://127.0.0.1:3000/api/health')).not.toThrow();
  });

  it('rejects userinfo', () => {
    expect(() => assertUrlAllowed('http://user:pass@127.0.0.1:3000/')).toThrow();
  });

  it('can re-enable allowlisted mode', () => {
    process.env.WORKFLOW_TOOL_URL_ALLOWLIST_MODE = 'allowlisted';
    expect(() => assertUrlAllowed('http://127.0.0.1:3000/api/health')).not.toThrow();
    expect(() => assertUrlAllowed('https://evil.example.com')).toThrow();
  });
});
