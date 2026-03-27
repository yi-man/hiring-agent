import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

export type SessionFixture = {
  userId: string;
  sessionToken: string;
  cleanup: () => Promise<void>;
};

export async function createUserWithSessionFixture(): Promise<SessionFixture> {
  const sessionToken = randomBytes(32).toString('hex');
  const user = await prisma.user.create({
    data: {
      name: 'Integration Test User',
      email: `it-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`,
    },
  });
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    userId: user.id,
    sessionToken,
    cleanup: async () => {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.message.deleteMany({
        where: { conversation: { userId: user.id } },
      });
      await prisma.conversation.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    },
  };
}
