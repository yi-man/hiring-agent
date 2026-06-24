import path from 'path';
import { config } from 'dotenv';
import { URL } from 'url';
import { execFileSync } from 'child_process';
import { Client } from 'pg';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env.development') });

function buildPostgresUrl(params: {
  host: string;
  port: string | number;
  user: string;
  password?: string;
  database: string;
}): string {
  const user = encodeURIComponent(params.user);
  const password = params.password ? `:${encodeURIComponent(params.password)}` : '';
  return `postgresql://${user}${password}@${params.host}:${params.port}/${params.database}`;
}

function applyCiDatabaseSuffix() {
  const ciSuffix = process.env.POSTGRES_CI_SUFFIX || '_ci';
  if (
    process.env.POSTGRES_HOST &&
    process.env.POSTGRES_PORT &&
    process.env.POSTGRES_USER &&
    process.env.POSTGRES_DATABASE
  ) {
    process.env.DATABASE_URL = buildPostgresUrl({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD ?? '',
      database: process.env.POSTGRES_DATABASE,
    });
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const dbName = url.pathname.replace(/^\//, '');
    url.pathname = `/${dbName.endsWith(ciSuffix) ? dbName : `${dbName}${ciSuffix}`}`;
    process.env.DATABASE_URL = url.toString();
  }

  if (process.env.POSTGRES_DATABASE) {
    process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE.endsWith(ciSuffix)
      ? process.env.POSTGRES_DATABASE
      : `${process.env.POSTGRES_DATABASE}${ciSuffix}`;
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
  const host = requireIntegrationEnv('POSTGRES_HOST');
  const port = Number(requireIntegrationEnv('POSTGRES_PORT'));
  const user = requireIntegrationEnv('POSTGRES_USER');
  const password = process.env.POSTGRES_PASSWORD ?? '';
  const database = requireIntegrationEnv('POSTGRES_DATABASE');
  process.env.DATABASE_URL = buildPostgresUrl({ host, port, user, password, database });

  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });
  await adminClient.connect();
  try {
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
    }
  } finally {
    await adminClient.end();
  }

  execFileSync('bun', ['run', 'prisma:migrate:deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
}

export async function assertPostgresReachable(): Promise<void> {
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
