import { CommandTransportBrowserExecutor } from './command-transport-executor';
import { HttpBrowserCommandTransport } from './http-command-transport';
import { PlaywrightBrowserExecutor } from './playwright-executor';
import { WebSocketBrowserCommandTransport } from './websocket-command-transport';
import type { BrowserAutomationConnectionRegistry } from './websocket-command-registry';
import type { BrowserExecutor } from '@/lib/browser/types';

export type BrowserExecutorAdapterName = 'playwright' | 'http-command' | 'websocket-command';
export type BrowserExecutorFactoryOptions = {
  defaultTimeoutMs?: number;
  userId?: string;
  registry?: BrowserAutomationConnectionRegistry;
};

type BrowserExecutorEnv = Record<string, string | undefined>;

function readAdapterName(env: BrowserExecutorEnv): BrowserExecutorAdapterName {
  const value =
    env.BROWSER_EXECUTOR?.trim() || env.JD_PUBLISHING_BROWSER_EXECUTOR?.trim() || 'playwright';
  if (value === 'playwright' || value === 'http-command' || value === 'websocket-command') {
    return value;
  }
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

function readEnv(
  env: BrowserExecutorEnv,
  primaryName: string,
  legacyName: string,
): string | undefined {
  return env[primaryName]?.trim() || env[legacyName]?.trim();
}

function readRequiredEnv(env: BrowserExecutorEnv, primaryName: string, legacyName: string): string {
  const value = readEnv(env, primaryName, legacyName);
  if (!value) {
    throw new Error(`${primaryName} is required for http-command browser executor`);
  }
  return value;
}

export function createBrowserExecutorFromEnv(
  env: BrowserExecutorEnv = process.env,
  options: BrowserExecutorFactoryOptions = {},
): BrowserExecutor {
  const adapterName = readAdapterName(env);
  const timeoutMs =
    readOptionalPositiveInteger(
      readEnv(env, 'BROWSER_COMMAND_TIMEOUT_MS', 'JD_PUBLISHING_BROWSER_COMMAND_TIMEOUT_MS'),
      'BROWSER_COMMAND_TIMEOUT_MS',
    ) ?? options.defaultTimeoutMs;

  if (adapterName === 'playwright') {
    return timeoutMs
      ? new PlaywrightBrowserExecutor({ timeoutMs })
      : new PlaywrightBrowserExecutor();
  }

  if (adapterName === 'websocket-command') {
    const userId = options.userId?.trim();
    if (!userId) {
      throw new Error('userId is required for websocket-command browser executor');
    }

    return new CommandTransportBrowserExecutor({
      timeoutMs,
      transport: new WebSocketBrowserCommandTransport({
        userId,
        registry: options.registry,
        endpoint: readEnv(
          env,
          'BROWSER_AUTOMATION_INTERNAL_ENDPOINT',
          'JD_PUBLISHING_BROWSER_AUTOMATION_INTERNAL_ENDPOINT',
        ),
        internalCommandToken: readEnv(
          env,
          'BROWSER_AUTOMATION_INTERNAL_TOKEN',
          'JD_PUBLISHING_BROWSER_AUTOMATION_INTERNAL_TOKEN',
        ),
        timeoutMs,
      }),
    });
  }

  return new CommandTransportBrowserExecutor({
    timeoutMs,
    transport: new HttpBrowserCommandTransport({
      endpoint: readRequiredEnv(
        env,
        'BROWSER_COMMAND_ENDPOINT',
        'JD_PUBLISHING_BROWSER_COMMAND_ENDPOINT',
      ),
      timeoutMs,
    }),
  });
}
