import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE_NAME = 'hiring-agent.session';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type LocalAuthSession = {
  user: {
    id: string;
    username: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

export async function createUserSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      expires,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    expires,
  });

  return { token, expires };
}

export async function getSessionFromCookie(): Promise<LocalAuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expires <= new Date()) {
    await prisma.session.deleteMany({
      where: { sessionToken: token },
    });
    return null;
  }

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  };
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: { sessionToken: token },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
