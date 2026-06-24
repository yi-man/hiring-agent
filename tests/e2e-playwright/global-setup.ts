import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { loadRepoEnv } from './load-repo-env';

function buildPostgresUrl(params: {
  host: string;
  port: string;
  user: string;
  password?: string;
  database: string;
}): string {
  const user = encodeURIComponent(params.user);
  const password = params.password ? `:${encodeURIComponent(params.password)}` : '';
  return `postgresql://${user}${password}@${params.host}:${params.port}/${params.database}`;
}

async function ensurePostgresDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    return;
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const adminClient = new Client({ connectionString: adminUrl.toString() });
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
}

/**
 * Prisma CLI only reads DATABASE_URL; the app can also build it from POSTGRES_*.
 */
export default async function globalSetup() {
  loadRepoEnv(process.cwd());

  let databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    const host = process.env.POSTGRES_HOST?.trim();
    const port = process.env.POSTGRES_PORT?.trim();
    const user = process.env.POSTGRES_USER?.trim();
    const pass = process.env.POSTGRES_PASSWORD ?? '';
    const database = process.env.POSTGRES_DATABASE?.trim();
    if (host && port && user && database) {
      databaseUrl = buildPostgresUrl({ host, port, user, password: pass, database });
    }
  }

  if (!databaseUrl) {
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.warn(
      '[e2e global-setup] Skip DB steps: set DATABASE_URL or POSTGRES_HOST/POSTGRES_PORT/POSTGRES_USER/POSTGRES_DATABASE',
    );
    return;
  }

  try {
    await ensurePostgresDatabase(databaseUrl);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.warn('[e2e global-setup] postgres database ensure skipped:', msg.slice(0, 400));
  }

  try {
    execSync('bunx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- e2e diagnostics
    console.warn('[e2e global-setup] prisma migrate deploy skipped:', msg.slice(0, 400));
  }
}
