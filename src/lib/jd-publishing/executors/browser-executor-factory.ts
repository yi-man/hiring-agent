import { CommandTransportBrowserExecutor } from './command-transport-executor';
import { HttpBrowserCommandTransport } from './http-command-transport';
import { PlaywrightBrowserExecutor } from './playwright-executor';
import type { BrowserExecutor } from '@/lib/jd-publishing/types';

export type BrowserExecutorAdapterName = 'playwright' | 'http-command';

type BrowserExecutorEnv = Record<string, string | undefined>;

function readAdapterName(env: BrowserExecutorEnv): BrowserExecutorAdapterName {
  const value = env.JD_PUBLISHING_BROWSER_EXECUTOR?.trim() || 'playwright';
  if (value === 'playwright' || value === 'http-command') return value;
  throw new Error(`unsupported browser executor adapter: ${value}`);
}

function readOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readRequiredEnv(env: BrowserExecutorEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for http-command browser executor`);
  return value;
}

export function createBrowserExecutorFromEnv(
  env: BrowserExecutorEnv = process.env,
): BrowserExecutor {
  const adapterName = readAdapterName(env);
  if (adapterName === 'playwright') {
    return new PlaywrightBrowserExecutor();
  }

  const timeoutMs = readOptionalPositiveInteger(
    env.JD_PUBLISHING_BROWSER_COMMAND_TIMEOUT_MS,
    'JD_PUBLISHING_BROWSER_COMMAND_TIMEOUT_MS',
  );
  return new CommandTransportBrowserExecutor({
    timeoutMs,
    transport: new HttpBrowserCommandTransport({
      endpoint: readRequiredEnv(env, 'JD_PUBLISHING_BROWSER_COMMAND_ENDPOINT'),
      timeoutMs,
    }),
  });
}
