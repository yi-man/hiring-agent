import { type NextAuthOptions } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { logSanitizedAuthError, sanitizeAuthLogValue } from '@/lib/auth/safe-log';

const SIGN_IN_PATH = '/auth/signin';
const FRIENDLY_OAUTH_ERROR = 'oauth';

function isOAuthErrorCode(code: string | null): boolean {
  if (!code) {
    return false;
  }
  return code.startsWith('OAuth') || code === 'CallbackRouteError';
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'database',
  },
  pages: {
    signIn: SIGN_IN_PATH,
    error: SIGN_IN_PATH,
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? '',
      clientSecret: process.env.GITHUB_SECRET ?? '',
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user = {
        ...session.user,
        id: user.id,
      };

      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const parsed = new URL(url, baseUrl);
        if (
          parsed.origin === baseUrl &&
          parsed.pathname === '/api/auth/error' &&
          isOAuthErrorCode(parsed.searchParams.get('error'))
        ) {
          return `${baseUrl}${SIGN_IN_PATH}?error=${FRIENDLY_OAUTH_ERROR}`;
        }
        if (url.startsWith('/')) {
          return `${baseUrl}${url}`;
        }
        if (parsed.origin === baseUrl) {
          return parsed.toString();
        }
      } catch {
        return baseUrl;
      }
      return baseUrl;
    },
  },
  logger: {
    error(code, ...message) {
      logSanitizedAuthError(code, ...message);
    },
    warn(code, ...message) {
      console.warn(
        '[next-auth][warn]',
        code,
        ...message.map((entry) => sanitizeAuthLogValue(entry)),
      );
    },
    debug(code, ...message) {
      console.debug(
        '[next-auth][debug]',
        code,
        ...message.map((entry) => sanitizeAuthLogValue(entry)),
      );
    },
  },
};
