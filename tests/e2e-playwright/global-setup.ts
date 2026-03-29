import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { loadRepoEnv } from './load-repo-env';

/**
 * Prisma migrate deploy 在「已有表但未 baseline」的库上会 P3005。
 * 仍保证 chat 流式接口需要的 messages.document_id 存在（与迁移一致）。
 */
async function ensureMessageDocumentIdColumn(databaseUrl: string) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `messages` ADD COLUMN `document_id` VARCHAR(36) NULL',
    );
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.log('[e2e global-setup] ensured messages.document_id column');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('1060') ||
      msg.toLowerCase().includes('duplicate') ||
      msg.toLowerCase().includes('already exists')
    ) {
      return;
    }
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.warn('[e2e global-setup] messages.document_id ensure:', msg.slice(0, 240));
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Prisma CLI only reads DATABASE_URL; the app often uses MYSQL_* via buildDatabaseUrl.
 */
export default async function globalSetup() {
  loadRepoEnv(process.cwd());

  let databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    const host = process.env.MYSQL_HOST?.trim();
    const port = process.env.MYSQL_PORT?.trim();
    const user = process.env.MYSQL_USER?.trim();
    const pass = process.env.MYSQL_PASS ?? '';
    const database = process.env.MYSQL_DATABASE?.trim();
    if (host && port && user && database) {
      databaseUrl = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`;
    }
  }

  if (!databaseUrl) {
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.warn(
      '[e2e global-setup] Skip DB steps: set DATABASE_URL or MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_DATABASE',
    );
    return;
  }

  try {
    execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.warn('[e2e global-setup] prisma migrate deploy skipped:', msg.slice(0, 400));
  }

  await ensureMessageDocumentIdColumn(databaseUrl);
}
