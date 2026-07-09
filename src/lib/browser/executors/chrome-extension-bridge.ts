import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import type { BrowserCommand, BrowserCommandResult } from '@/lib/browser/types';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4100;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 1_000_000;

type PendingCommand = {
  command: BrowserCommand;
  resolve: (result: BrowserCommandResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type PollWaiter = {
  resolve: (command: BrowserCommand | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type ChromeExtensionBridgeServerOptions = {
  host?: string;
  port?: number;
  commandTimeoutMs?: number;
  pollTimeoutMs?: number;
};

function isBrowserCommand(value: unknown): value is BrowserCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.action === 'string' &&
    typeof record.params === 'object' &&
    record.params !== null &&
    typeof record.timeoutMs === 'number'
  );
}

function isBrowserCommandResult(value: unknown): value is BrowserCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.commandId === 'string' && typeof record.success === 'boolean';
}

function extensionCorsOrigin(request: IncomingMessage): string | undefined {
  const origin = request.headers.origin;
  return typeof origin === 'string' && origin.startsWith('chrome-extension://')
    ? origin
    : undefined;
}

function writeCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = extensionCorsOrigin(request);
  if (origin) {
    response.setHeader('access-control-allow-origin', origin);
  }
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('connection', 'close');
}

function writeJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  writeCors(request, response);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(value));
}

function writeNoContent(request: IncomingMessage, response: ServerResponse): void {
  writeCors(request, response);
  response.statusCode = 204;
  response.end();
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export class ChromeExtensionBridgeServer {
  private server: Server | null = null;
  private address: AddressInfo | null = null;
  private readonly commandQueue: BrowserCommand[] = [];
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly pollWaiters: PollWaiter[] = [];

  constructor(private readonly options: ChromeExtensionBridgeServerOptions = {}) {}

  get commandTimeoutMs(): number {
    return this.options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  get pollTimeoutMs(): number {
    return this.options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  }

  get baseUrl(): string {
    if (!this.address) {
      const host = this.options.host ?? DEFAULT_HOST;
      const port = this.options.port ?? DEFAULT_PORT;
      return `http://${host}:${port}`;
    }
    return `http://${this.address.address}:${this.address.port}`;
  }

  get commandEndpoint(): string {
    return `${this.baseUrl}/browser-command`;
  }

  get nextCommandEndpoint(): string {
    return `${this.baseUrl}/browser-command/next`;
  }

  get resultEndpoint(): string {
    return `${this.baseUrl}/browser-command/result`;
  }

  async listen(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    const host = this.options.host ?? DEFAULT_HOST;
    const port = this.options.port ?? DEFAULT_PORT;
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(port, host, () => {
        this.server?.off('error', reject);
        this.address = this.server?.address() as AddressInfo;
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    for (const waiter of this.pollWaiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.resolve(null);
    }
    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.resolve({
        commandId,
        success: false,
        error: 'chrome_extension_bridge_closed',
      });
    }
    this.pendingCommands.clear();
    this.commandQueue.length = 0;

    const server = this.server;
    this.server = null;
    this.address = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    writeCors(request, response);
    if (request.method === 'OPTIONS') {
      writeNoContent(request, response);
      return;
    }

    const url = new URL(request.url ?? '/', this.baseUrl);
    try {
      if (request.method === 'POST' && url.pathname === '/browser-command') {
        await this.handleCommand(request, response);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/browser-command/next') {
        await this.handleNextCommand(request, response);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/browser-command/result') {
        await this.handleResult(request, response);
        return;
      }
      writeJson(request, response, 404, { error: 'not_found' });
    } catch (error) {
      writeJson(request, response, 400, {
        error: error instanceof Error ? error.message : 'invalid_request',
      });
    }
  }

  private async handleCommand(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const parsed = await readJson(request);
    if (!isBrowserCommand(parsed)) {
      writeJson(request, response, 400, { error: 'invalid browser command envelope' });
      return;
    }

    const result = await new Promise<BrowserCommandResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(parsed.id);
        this.removeQueuedCommand(parsed.id);
        resolve({
          commandId: parsed.id,
          success: false,
          error: 'chrome_extension_command_timeout',
        });
      }, this.commandTimeoutMs);
      this.pendingCommands.set(parsed.id, { command: parsed, resolve, timeout });
      this.dispatchCommand(parsed);
    });

    writeJson(request, response, 200, result);
  }

  private async handleNextCommand(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const queued = this.commandQueue.shift();
    if (queued) {
      writeJson(request, response, 200, queued);
      return;
    }

    const command = await new Promise<BrowserCommand | null>((resolve) => {
      const waiter: PollWaiter = {
        resolve,
        timeout: setTimeout(() => {
          this.removePollWaiter(waiter);
          resolve(null);
        }, this.pollTimeoutMs),
      };
      this.pollWaiters.push(waiter);
    });
    if (!command) {
      writeNoContent(request, response);
      return;
    }
    writeJson(request, response, 200, command);
  }

  private async handleResult(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const parsed = await readJson(request);
    if (!isBrowserCommandResult(parsed)) {
      writeJson(request, response, 400, { error: 'invalid browser command result envelope' });
      return;
    }
    const pending = this.pendingCommands.get(parsed.commandId);
    if (!pending) {
      writeJson(request, response, 404, { error: 'unknown browser command result' });
      return;
    }
    this.pendingCommands.delete(parsed.commandId);
    clearTimeout(pending.timeout);
    pending.resolve(parsed);
    writeNoContent(request, response);
  }

  private dispatchCommand(command: BrowserCommand): void {
    while (this.pollWaiters.length > 0) {
      const waiter = this.pollWaiters.shift();
      if (!waiter) continue;
      clearTimeout(waiter.timeout);
      waiter.resolve(command);
      return;
    }
    this.commandQueue.push(command);
  }

  private removeQueuedCommand(commandId: string): void {
    const index = this.commandQueue.findIndex((command) => command.id === commandId);
    if (index >= 0) this.commandQueue.splice(index, 1);
  }

  private removePollWaiter(waiter: PollWaiter): void {
    const index = this.pollWaiters.indexOf(waiter);
    if (index >= 0) this.pollWaiters.splice(index, 1);
  }
}
