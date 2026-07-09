import { prisma } from '@/lib/prisma';

export type AuthenticatedSessionToken = {
  userId: string;
};

export async function authenticateSessionToken(
  sessionToken: string,
): Promise<AuthenticatedSessionToken | null> {
  if (!sessionToken.trim()) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: {
      userId: true,
      expires: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expires <= new Date()) {
    await prisma.session.deleteMany({
      where: { sessionToken },
    });
    return null;
  }

  return { userId: session.userId };
}
