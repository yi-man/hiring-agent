jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));

jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn((config) => ({ id: 'github', name: 'GitHub', type: 'oauth', options: config })),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { authOptions } from '@/auth';

describe('oauth error flow', () => {
  it('routes oauth errors back to the sign-in entry path', async () => {
    const redirect = authOptions.callbacks?.redirect;
    expect(redirect).toBeDefined();
    if (!redirect) {
      return;
    }

    const destination = await redirect({
      baseUrl: 'https://app.example.com',
      url: 'https://app.example.com/api/auth/error?error=OAuthCallback',
    });

    expect(destination).toBe('https://app.example.com/auth/signin?error=oauth');
    expect(authOptions.pages?.signIn).toBe('/auth/signin');
    expect(authOptions.pages?.error).toBe('/auth/signin');
  });

  it('redacts secret/token values in auth error logs', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loggerError = authOptions.logger?.error;
    expect(loggerError).toBeDefined();
    if (!loggerError) {
      spy.mockRestore();
      return;
    }

    loggerError('OAUTH_CALLBACK_HANDLER_ERROR', {
      access_token: 'plain-access-token',
      refreshToken: 'plain-refresh-token',
      clientSecret: 'plain-client-secret',
      idToken: 'plain-id-token',
      nested: {
        secret: 'nested-secret',
      },
      url: 'https://example.com/callback?token=plain-token&secret=plain-secret&oauth=abc&code=xyz&client_secret=cc&session_token=ss',
      header: 'Authorization: Basic Zm9vOmJhcg==',
      bearer: 'Authorization: Bearer abc.def.ghi',
    });

    expect(spy).toHaveBeenCalled();
    const [prefix, code, payload] = spy.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(prefix).toBe('[next-auth][error]');
    expect(code).toBe('OAUTH_CALLBACK_HANDLER_ERROR');
    expect(payload.access_token).toBe('[REDACTED]');
    expect(payload.refreshToken).toBe('[REDACTED]');
    expect(payload.clientSecret).toBe('[REDACTED]');
    expect(payload.idToken).toBe('[REDACTED]');
    expect(payload.nested).toEqual({ secret: '[REDACTED]' });
    expect(payload.url).toBe(
      'https://example.com/callback?token=[REDACTED]&secret=[REDACTED]&oauth=[REDACTED]&code=[REDACTED]&client_secret=[REDACTED]&session_token=[REDACTED]',
    );
    expect(payload.header).toBe('Authorization: Basic [REDACTED]');
    expect(payload.bearer).toBe('Authorization: Bearer [REDACTED]');
    spy.mockRestore();
  });

  it('falls back to baseUrl when redirect url is invalid', async () => {
    const redirect = authOptions.callbacks?.redirect;
    expect(redirect).toBeDefined();
    if (!redirect) {
      return;
    }

    const destination = await redirect({
      baseUrl: 'https://app.example.com',
      url: 'http://[::1',
    });
    expect(destination).toBe('https://app.example.com');
  });
});
