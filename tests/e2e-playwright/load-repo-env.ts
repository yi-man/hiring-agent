import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const LOOPBACK_NO_PROXY = '127.0.0.1,localhost,::1';

/**
 * dotenv override 可能把 NO_PROXY 置空；Node fetch / Playwright request 会走系统代理，本机 502 或长时间挂起。
 * 在每次加载仓库 env 后补回环绕过（不覆盖已有含 loopback 的值）。
 */
function mergeLoopbackNoProxy() {
  for (const key of ['NO_PROXY', 'no_proxy'] as const) {
    const cur = process.env[key]?.trim();
    if (!cur) {
      process.env[key] = LOOPBACK_NO_PROXY;
      continue;
    }
    if (cur.includes('127.0.0.1') || cur.includes('localhost') || cur.includes('::1')) {
      continue;
    }
    process.env[key] = `${cur},${LOOPBACK_NO_PROXY}`;
  }
}

/** 与本地开发一致：先 .env 再 .env.local，后者覆盖前者 */
export function loadRepoEnv(cwd: string) {
  for (const name of ['.env', '.env.local']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: true, quiet: true });
    }
  }
  mergeLoopbackNoProxy();
}
