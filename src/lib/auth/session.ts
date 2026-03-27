import type { Session } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/auth';

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  readonly status = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function getServerAuthSession(): Promise<Session | null> {
  return getServerSession(authOptions);
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
