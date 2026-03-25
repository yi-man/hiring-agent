import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

/** 与本地开发一致：先 .env 再 .env.local，后者覆盖前者 */
export function loadRepoEnv(cwd: string) {
  for (const name of ['.env', '.env.local']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: true, quiet: true });
    }
  }
}
