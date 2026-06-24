import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/prisma';

export const DEFAULT_USERNAME = 'xxwade';
export const DEFAULT_PASSWORD = 'hiring_2026';

export async function ensureDefaultUser() {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  return prisma.user.upsert({
    where: { username: DEFAULT_USERNAME },
    update: {
      name: DEFAULT_USERNAME,
      passwordHash,
    },
    create: {
      username: DEFAULT_USERNAME,
      name: DEFAULT_USERNAME,
      passwordHash,
    },
  });
}
