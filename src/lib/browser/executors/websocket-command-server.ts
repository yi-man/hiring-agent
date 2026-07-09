import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { BrowserCommand, BrowserCommandResult } from '@/lib/browser/types';
import {
  browserAutomationConnectionRegistry,
  type BrowserAutomationConnection,
  type BrowserAutomationConnectionRegistry,
} from './websocket-command-registry';

export const BROWSER_AUTOMATION_SOCKET_PATH = '/api/browser-automation/socket';
export const BROWSER_AUTOMATION_COMMAND_PATH = '/api/browser-automation/command';

const DEFAULT_HELLO_TIMEOUT_MS = 10_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 1_000_000;

export type BrowserAutomationAuthenticatedSession = {
  userId: string;
};

export type BrowserAutomationWebSocketServerOptions = {
  path?: string;
  commandPath?: string;
  registry?: BrowserAutomationConnectionRegistry;
  helloTimeoutMs?: number;
  internalCommandToken?: string;
  authenticateSessionToken(
    sessionToken: string,
  ): Promise<BrowserAutomationAuthenticatedSession | null>;
};

type PendingCommand = {
  resolve(result: BrowserCommandResult): void;
  timeout: ReturnType<typeof setTimeout>;
};

type ClientMessage =
  | { type: 'hello'; sessionToken: string }
  | { type: 'result'; result: BrowserCommandResult };

function socketPathMatches(request: IncomingMessage, path: string): boolean {
  const url = new URL(request.url ?? '/', 'http://localhost');
  return url.pathname === path;
}

function requestPathMatches(request: IncomingMessage, path: string): boolean {
  const url = new URL(request.url ?? '/', 'http://localhost');
  return url.pathname === path;
}

function parseClientMessage(data: WebSocket.RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.type === 'hello' && typeof record.sessionToken === 'string') {
      return { type: 'hello', sessionToken: record.sessionToken };
    }
    if (record.type === 'result' && isBrowserCommandResult(record.result)) {
      return { type: 'result', result: record.result };
    }
    return null;
  } catch {
    return null;
  }
}

function isBrowserCommandResult(value: unknown): value is BrowserCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.commandId === 'string' && typeof record.success === 'boolean';
}

function isBrowserCommand(value: unknown): value is BrowserCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.taskId === 'string' &&
    typeof record.stepId === 'string' &&
    typeof record.action === 'string' &&
    typeof record.params === 'object' &&
    record.params !== null &&
    typeof record.timeoutMs === 'number'
  );
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

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(value));
}

function isInternalCommandRequest(
  value: unknown,
): value is { userId: string; command: BrowserCommand; timeoutMs?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.userId === 'string' &&
    isBrowserCommand(record.command) &&
    (typeof record.timeoutMs === 'undefined' || typeof record.timeoutMs === 'number')
  );
}

class BrowserAutomationSocketConnection implements BrowserAutomationConnection {
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private commandQueue: Promise<void> = Promise.resolve();
  private unregister: (() => void) | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly userId: string,
    private readonly registry: BrowserAutomationConnectionRegistry,
  ) {}

  register(): void {
    this.unregister = this.registry.register(this.userId, this);
    this.socket.on('message', (data) => {
      const message = parseClientMessage(data);
      if (message?.type === 'result') {
        this.resolveResult(message.result);
      }
    });
    this.socket.once('close', () => this.dispose('browser_extension_disconnected'));
    this.socket.once('error', () => this.dispose('browser_extension_disconnected'));
  }

  sendCommand(command: BrowserCommand, timeoutMs?: number): Promise<BrowserCommandResult> {
    const result = this.commandQueue.then(
      () => this.dispatchCommand(command, timeoutMs),
      () => this.dispatchCommand(command, timeoutMs),
    );
    this.commandQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private dispatchCommand(
    command: BrowserCommand,
    timeoutMs?: number,
  ): Promise<BrowserCommandResult> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        commandId: command.id,
        success: false,
        error: 'browser_extension_not_connected',
      });
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => {
          this.resolveResult({
            commandId: command.id,
            success: false,
            error: 'browser_extension_command_timeout',
          });
        },
        timeoutMs ?? command.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      );

      this.pendingCommands.set(command.id, { resolve, timeout });
      this.socket.send(JSON.stringify({ type: 'command', command }), (error) => {
        if (error) {
          this.resolveResult({
            commandId: command.id,
            success: false,
            error: error.message || 'browser_extension_send_failed',
          });
        }
      });
    });
  }

  close(): void {
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
    this.dispose('browser_extension_connection_replaced');
  }

  private resolveResult(result: BrowserCommandResult): void {
    const pending = this.pendingCommands.get(result.commandId);
    if (!pending) return;

    this.pendingCommands.delete(result.commandId);
    clearTimeout(pending.timeout);
    pending.resolve(result);
  }

  private dispose(error: string): void {
    this.unregister?.();
    this.unregister = null;

    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.resolve({ commandId, success: false, error });
    }
    this.pendingCommands.clear();
  }
}

export class BrowserAutomationWebSocketServer {
  private readonly path: string;
  private readonly commandPath: string;
  private readonly registry: BrowserAutomationConnectionRegistry;
  private readonly webSocketServer = new WebSocketServer({ noServer: true });

  constructor(private readonly options: BrowserAutomationWebSocketServerOptions) {
    this.path = options.path ?? BROWSER_AUTOMATION_SOCKET_PATH;
    this.commandPath = options.commandPath ?? BROWSER_AUTOMATION_COMMAND_PATH;
    this.registry = options.registry ?? browserAutomationConnectionRegistry;
    this.webSocketServer.on('connection', (socket) => {
      void this.handleConnection(socket);
    });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (!socketPathMatches(request, this.path)) {
      return false;
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.webSocketServer.emit('connection', webSocket, request);
    });
    return true;
  }

  handleRequest(request: IncomingMessage, response: ServerResponse): boolean {
    if (!requestPathMatches(request, this.commandPath)) {
      return false;
    }

    void this.handleCommandRequest(request, response);
    return true;
  }

  async close(): Promise<void> {
    for (const socket of this.webSocketServer.clients) {
      socket.close();
    }

    await new Promise<void>((resolve, reject) => {
      this.webSocketServer.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async handleConnection(socket: WebSocket): Promise<void> {
    const message = await this.waitForHello(socket);
    if (!message) {
      socket.close(1008, 'browser_automation_auth_required');
      return;
    }

    try {
      const session = await this.options.authenticateSessionToken(message.sessionToken);
      if (!session) {
        socket.close(1008, 'browser_automation_auth_failed');
        return;
      }

      const connection = new BrowserAutomationSocketConnection(
        socket,
        session.userId,
        this.registry,
      );
      connection.register();
      socket.send(JSON.stringify({ type: 'ready', userId: session.userId }));
    } catch {
      socket.close(1011, 'browser_automation_auth_error');
    }
  }

  private async handleCommandRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    const expectedToken = this.options.internalCommandToken;
    if (
      !expectedToken ||
      request.headers['x-browser-automation-internal-token'] !== expectedToken
    ) {
      writeJson(response, 403, { error: 'forbidden' });
      return;
    }

    try {
      const parsed = await readJson(request);
      if (!isInternalCommandRequest(parsed)) {
        writeJson(response, 400, { error: 'invalid browser automation command request' });
        return;
      }

      const result = await this.registry.sendCommand(
        parsed.userId,
        parsed.command,
        parsed.timeoutMs,
      );
      writeJson(response, 200, result);
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'invalid_request',
      });
    }
  }

  private waitForHello(socket: WebSocket): Promise<{ type: 'hello'; sessionToken: string } | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, this.options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        socket.off('close', onClose);
        socket.off('error', onClose);
      };

      const onClose = () => {
        cleanup();
        resolve(null);
      };

      const onMessage = (data: WebSocket.RawData) => {
        const message = parseClientMessage(data);
        cleanup();
        resolve(message?.type === 'hello' ? message : null);
      };

      socket.once('message', onMessage);
      socket.once('close', onClose);
      socket.once('error', onClose);
    });
  }
}
