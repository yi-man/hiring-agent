import path from 'path';
import { config } from 'dotenv';
import { URL } from 'url';

config({ path: path.resolve(process.cwd(), '.env.development') });
config({ path: path.resolve(process.cwd(), '.env.local') });

function applyCiDatabaseSuffix() {
  const ciSuffix = process.env.MYSQL_CI_SUFFIX || '_ci';
  if (!process.env.DATABASE_URL) {
    if (process.env.MYSQL_URL) {
      process.env.DATABASE_URL = process.env.MYSQL_URL;
    } else if (
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
