import { assertUrlAllowed } from './url-allowlist';

describe('assertUrlAllowed', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it('allows http://127.0.0.1:3000/api/health', () => {
    expect(() => assertUrlAllowed('http://127.0.0.1:3000/api/health')).not.toThrow();
  });

  it('rejects https://evil.example.com', () => {
    expect(() => assertUrlAllowed('https://evil.example.com')).toThrow();
  });

  it('rejects userinfo', () => {
    expect(() => assertUrlAllowed('http://user:pass@127.0.0.1:3000/')).toThrow();
  });
});
