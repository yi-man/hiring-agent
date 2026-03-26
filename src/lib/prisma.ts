import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl } from '@/lib/database-url';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function createPrismaClient(options?: { dbNameSuffix?: string }): PrismaClient {
  return new PrismaClient({
    datasourceUrl: buildDatabaseUrl({ dbNameSuffix: options?.dbNameSuffix }),
  });
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: buildDatabaseUrl(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function closePrismaClient(): Promise<void> {
  await prisma.$disconnect();
}
