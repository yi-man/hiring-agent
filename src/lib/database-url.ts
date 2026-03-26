import { env } from '@/lib/env';

export function buildDatabaseUrl(options?: { dbNameSuffix?: string }): string {
  const suffix = options?.dbNameSuffix ?? '';
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (suffix) {
      const dbName = url.pathname.replace(/^\//, '');
      url.pathname = `/${dbName}${suffix}`;
    }
    return url.toString();
  }

  const database = `${env.MYSQL_DATABASE}${suffix}`;
  const user = encodeURIComponent(env.MYSQL_USER);
  const pass = encodeURIComponent(env.MYSQL_PASS);
  return `mysql://${user}:${pass}@${env.MYSQL_HOST}:${env.MYSQL_PORT}/${database}`;
}
