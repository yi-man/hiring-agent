import { createPool, type Pool } from 'mysql2/promise';
import { env } from '@/lib/env';

let pool: Pool | null = null;

function buildConnectionUri(): string {
  if (env.MYSQL_URL) return env.MYSQL_URL;
  const user = encodeURIComponent(env.MYSQL_USER);
  const pass = encodeURIComponent(env.MYSQL_PASS);
  return `mysql://${user}:${pass}@${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DATABASE}`;
}

export function getMySqlPool(): Pool {
  if (pool) return pool;
  pool = createPool({
    uri: buildConnectionUri(),
    connectionLimit: 10,
  });
  return pool;
}

export async function closeMySqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
