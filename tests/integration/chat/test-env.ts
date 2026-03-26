import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '.env.development') });
config({ path: path.resolve(process.cwd(), '.env.local') });

export function requireIntegrationEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required integration env: ${name}`);
  }
  return value;
}
