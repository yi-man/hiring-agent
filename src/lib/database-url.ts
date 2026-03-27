import { env } from '@/lib/env';

export function buildDatabaseUrl(options?: { dbNameSuffix?: string }): string {
  const suffix = options?.dbNameSuffix ?? '';
  const database = `${env.MYSQL_DATABASE}${suffix}`;
  const user = encodeURIComponent(env.MYSQL_USER);
  const pass = encodeURIComponent(env.MYSQL_PASS);
  return `mysql://${user}:${pass}@${env.MYSQL_HOST}:${env.MYSQL_PORT}/${database}`;
}
