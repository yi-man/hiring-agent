/**
 * @jest-environment node
 */
import { BrowserAutomationConnectionRegistry } from './websocket-command-registry';
import { WebSocketBrowserCommandTransport } from './websocket-command-transport';
import type { BrowserCommand, BrowserCommandResult } from '@/lib/browser/types';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

function command(id = 'cmd-1'): BrowserCommand {
  return {
    id,
    taskId: 'task-1',
    stepId: 'fill_title',
    action: 'fill',
    target: { kind: 'field', role: 'textbox', name: '职位名称', exact: true },
    params: { value: '高级前端工程师' },
    timeoutMs: 1_000,
  };
}

describe('WebSocketBrowserCommandTransport', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('sends commands to the active browser extension connection for the user', async () => {
    const registry = new BrowserAutomationConnectionRegistry();
    const sent: BrowserCommand[] = [];
    const expected: BrowserCommandResult = {
      commandId: 'cmd-1',
      success: true,
    };
    registry.register('user-1', {
      sendCommand: async (nextCommand) => {
        sent.push(nextCommand);
        return expected;
      },
      close: jest.fn(),
    });
    const transport = new WebSocketBrowserCommandTransport({
      userId: 'user-1',
      registry,
      timeoutMs: 1_000,
    });

    await expect(transport.send(command())).resolves.toEqual(expected);
    expect(sent).toEqual([command()]);
  });

  it('returns a command-shaped failure when the user has no active extension connection', async () => {
    const transport = new WebSocketBrowserCommandTransport({
      userId: 'offline-user',
      registry: new BrowserAutomationConnectionRegistry(),
      timeoutMs: 1_000,
    });

    await expect(transport.send(command('cmd-offline'))).resolves.toEqual({
      commandId: 'cmd-offline',
      success: false,
      error: 'browser_extension_not_connected',
    });
  });

  it('posts commands to the same-port internal endpoint when no in-memory registry is injected', async () => {
    const received: unknown[] = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          method: request.method,
          url: request.url,
          token: request.headers['x-browser-automation-internal-token'],
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ commandId: 'cmd-1', success: true }));
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const transport = new WebSocketBrowserCommandTransport({
      userId: 'user-1',
      endpoint: `http://127.0.0.1:${address.port}/api/browser-automation/command`,
      internalCommandToken: 'internal-token',
      timeoutMs: 1_000,
    });

    await expect(transport.send(command())).resolves.toEqual({
      commandId: 'cmd-1',
      success: true,
    });
    expect(received).toEqual([
      {
        method: 'POST',
        url: '/api/browser-automation/command',
        token: 'internal-token',
        body: {
          userId: 'user-1',
          command: command(),
          timeoutMs: 1_000,
        },
      },
    ]);
  });
});
