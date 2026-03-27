import { getSignInErrorMessage } from '@/lib/auth/signin-error';

describe('getSignInErrorMessage', () => {
  it('returns friendly text for oauth errors', () => {
    expect(getSignInErrorMessage('oauth')).toBe(
      'Sign-in failed while connecting to the provider. Please retry in a moment.',
    );
    expect(getSignInErrorMessage('OAUTH')).toBe(
      'Sign-in failed while connecting to the provider. Please retry in a moment.',
    );
  });

  it('returns default text for unknown or empty errors', () => {
    expect(getSignInErrorMessage('SomeOtherError')).toBe('Unable to sign in. Please try again.');
    expect(getSignInErrorMessage('')).toBe('Unable to sign in. Please try again.');
    expect(getSignInErrorMessage(undefined)).toBe('Unable to sign in. Please try again.');
    expect(getSignInErrorMessage(null)).toBe('Unable to sign in. Please try again.');
  });
});
