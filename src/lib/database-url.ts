import { env } from '@/lib/env';

function appendDatabaseSuffix(databaseUrl: string, suffix: string): string {
  if (!suffix) {
    return databaseUrl;
  }

  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  url.pathname = `/${database}${suffix}`;
  return url.toString();
}

export function buildDatabaseUrl(options?: { dbNameSuffix?: string }): string {
  const suffix = options?.dbNameSuffix ?? '';
  const configuredUrl = process.env.DATABASE_URL?.trim();
  if (configuredUrl) {
    return appendDatabaseSuffix(configuredUrl, suffix);
  }

  const database = `${env.POSTGRES_DATABASE}${suffix}`;
  const user = encodeURIComponent(env.POSTGRES_USER);
  const password = encodeURIComponent(env.POSTGRES_PASSWORD);
  const credentials = password ? `${user}:${password}` : user;
  return `postgresql://${credentials}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${database}`;
}
