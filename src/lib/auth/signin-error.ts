const DEFAULT_SIGNIN_ERROR_MESSAGE = 'Unable to sign in. Please try again.';
const OAUTH_SIGNIN_ERROR_MESSAGE =
  'Sign-in failed while connecting to the provider. Please retry in a moment.';

export function getSignInErrorMessage(errorCode: string | null | undefined): string {
  if (!errorCode) {
    return DEFAULT_SIGNIN_ERROR_MESSAGE;
  }
  if (errorCode.toLowerCase() === 'oauth') {
    return OAUTH_SIGNIN_ERROR_MESSAGE;
  }
  return DEFAULT_SIGNIN_ERROR_MESSAGE;
}
