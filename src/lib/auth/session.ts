import { getSessionFromCookie, type LocalAuthSession } from '@/lib/auth/local-session';

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  readonly status = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function getServerAuthSession(): Promise<LocalAuthSession | null> {
  return getSessionFromCookie();
}

export async function requireAuth(): Promise<{ user: { id: string } }> {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new UnauthorizedError();
  }

  return {
    user: {
      id: userId,
    },
  };
}
