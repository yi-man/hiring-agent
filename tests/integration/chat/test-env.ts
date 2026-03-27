import path from 'path';
import { config } from 'dotenv';
import { URL } from 'url';
import { execFileSync } from 'child_process';
import { createPool } from 'mysql2/promise';

config({ path: path.resolve(process.cwd(), '.env.development') });
config({ path: path.resolve(process.cwd(), '.env.local') });

function applyCiDatabaseSuffix() {
  const ciSuffix = process.env.MYSQL_CI_SUFFIX || '_ci';
  if (
    process.env.MYSQL_HOST &&
    process.env.MYSQL_PORT &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_PASS &&
    process.env.MYSQL_DATABASE
  ) {
    const user = encodeURIComponent(process.env.MYSQL_USER);
    const pass = encodeURIComponent(process.env.MYSQL_PASS);
    process.env.DATABASE_URL = `mysql://${user}:${pass}@${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}/${process.env.MYSQL_DATABASE}`;
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const dbName = url.pathname.replace(/^\//, '');
    url.pathname = `/${dbName.endsWith(ciSuffix) ? dbName : `${dbName}${ciSuffix}`}`;
    process.env.DATABASE_URL = url.toString();
  }

  if (process.env.MYSQL_DATABASE) {
    process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE.endsWith(ciSuffix)
      ? process.env.MYSQL_DATABASE
      : `${process.env.MYSQL_DATABASE}${ciSuffix}`;
  }
}

applyCiDatabaseSuffix();

export function requireIntegrationEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required integration env: ${name}`);
  }
  return value;
}

export async function ensureIntegrationSchema(): Promise<void> {
  const host = requireIntegrationEnv('MYSQL_HOST');
  const port = Number(requireIntegrationEnv('MYSQL_PORT'));
  const user = requireIntegrationEnv('MYSQL_USER');
  const password = requireIntegrationEnv('MYSQL_PASS');
  const database = requireIntegrationEnv('MYSQL_DATABASE');
  process.env.DATABASE_URL = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');
  const adminPool = createPool({
    host,
    port,
    user,
    password,
    connectionLimit: 1,
  });
  await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await adminPool.end();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
}

export async function assertMysqlReachable(): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.$queryRaw`SELECT 1`;
}

export async function assertRedisReachable(): Promise<void> {
  const { createClient } = await import('redis');
  const url = requireIntegrationEnv('REDIS_URL');
  const client = createClient({ url });
  await client.connect();
  await client.ping();
  await client.quit();
}
