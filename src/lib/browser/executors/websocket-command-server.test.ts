/**
 * @jest-environment node
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { BrowserAutomationWebSocketServer } from './websocket-command-server';
import { BrowserAutomationConnectionRegistry } from './websocket-command-registry';
import type { BrowserCommand, BrowserCommandResult } from '@/lib/browser/types';

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

async function listen(server: Server): Promise<{ httpBaseUrl: string; wsBaseUrl: string }> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    httpBaseUrl: `http://127.0.0.1:${address.port}`,
    wsBaseUrl: `ws://127.0.0.1:${address.port}`,
  };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function waitForMessage<T>(socket: WebSocket): Promise<T> {
  return new Promise((resolve) => {
    socket.once('message', (data) => {
      resolve(JSON.parse(data.toString()) as T);
    });
  });
}

function waitForMessageWithin<T>(socket: WebSocket, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      resolve(null);
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as T);
    };
    socket.once('message', onMessage);
  });
}

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

describe('BrowserAutomationWebSocketServer', () => {
  let httpServer: Server | undefined;
  let browserServer: BrowserAutomationWebSocketServer | undefined;

  afterEach(async () => {
    await browserServer?.close();
    if (httpServer?.listening) {
      await close(httpServer);
    }
    httpServer = undefined;
    browserServer = undefined;
  });

  it('authenticates an extension socket and routes commands over the same connection', async () => {
    const registry = new BrowserAutomationConnectionRegistry();
    browserServer = new BrowserAutomationWebSocketServer({
      registry,
      authenticateSessionToken: async (sessionToken) =>
        sessionToken === 'session-1' ? { userId: 'user-1' } : null,
    });
    httpServer = createServer();
    httpServer.on('upgrade', (request, socket, head) => {
      if (!browserServer?.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    });
    const { wsBaseUrl } = await listen(httpServer);

    const socket = await openSocket(`${wsBaseUrl}/api/browser-automation/socket`);
    socket.send(JSON.stringify({ type: 'hello', sessionToken: 'session-1' }));
    await expect(waitForMessage(socket)).resolves.toEqual({
      type: 'ready',
      userId: 'user-1',
    });

    const pendingResult = registry.sendCommand('user-1', command(), 1_000);
    await expect(
      waitForMessage<{ type: 'command'; command: BrowserCommand }>(socket),
    ).resolves.toEqual({
      type: 'command',
      command: command(),
    });
    const result: BrowserCommandResult = { commandId: 'cmd-1', success: true };
    socket.send(JSON.stringify({ type: 'result', result }));

    await expect(pendingResult).resolves.toEqual(result);
    socket.close();
  });

  it('serializes commands for the same browser extension connection', async () => {
    const registry = new BrowserAutomationConnectionRegistry();
    browserServer = new BrowserAutomationWebSocketServer({
      registry,
      authenticateSessionToken: async () => ({ userId: 'user-1' }),
    });
    httpServer = createServer();
    httpServer.on('upgrade', (request, socket, head) => {
      if (!browserServer?.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    });
    const { wsBaseUrl } = await listen(httpServer);

    const socket = await openSocket(`${wsBaseUrl}/api/browser-automation/socket`);
    socket.send(JSON.stringify({ type: 'hello', sessionToken: 'session-1' }));
    await expect(waitForMessage(socket)).resolves.toEqual({
      type: 'ready',
      userId: 'user-1',
    });

    const firstResultPromise = registry.sendCommand('user-1', command('cmd-1'), 1_000);
    const secondResultPromise = registry.sendCommand('user-1', command('cmd-2'), 1_000);

    await expect(
      waitForMessage<{ type: 'command'; command: BrowserCommand }>(socket),
    ).resolves.toEqual({
      type: 'command',
      command: command('cmd-1'),
    });
    await expect(waitForMessageWithin(socket, 50)).resolves.toBeNull();

    const firstResult: BrowserCommandResult = { commandId: 'cmd-1', success: true };
    socket.send(JSON.stringify({ type: 'result', result: firstResult }));
    await expect(firstResultPromise).resolves.toEqual(firstResult);

    await expect(
      waitForMessage<{ type: 'command'; command: BrowserCommand }>(socket),
    ).resolves.toEqual({
      type: 'command',
      command: command('cmd-2'),
    });
    const secondResult: BrowserCommandResult = { commandId: 'cmd-2', success: true };
    socket.send(JSON.stringify({ type: 'result', result: secondResult }));
    await expect(secondResultPromise).resolves.toEqual(secondResult);
    socket.close();
  });

  it('closes sockets that cannot authenticate', async () => {
    browserServer = new BrowserAutomationWebSocketServer({
      authenticateSessionToken: async () => null,
    });
    httpServer = createServer();
    httpServer.on('upgrade', (request, socket, head) => {
      if (!browserServer?.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    });
    const { wsBaseUrl } = await listen(httpServer);

    const socket = await openSocket(`${wsBaseUrl}/api/browser-automation/socket`);
    socket.send(JSON.stringify({ type: 'hello', sessionToken: 'bad-session' }));

    await new Promise<void>((resolve) => socket.once('close', () => resolve()));
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('closes sockets when session authentication throws', async () => {
    browserServer = new BrowserAutomationWebSocketServer({
      authenticateSessionToken: async () => {
        throw new Error('database unavailable');
      },
    });
    httpServer = createServer();
    httpServer.on('upgrade', (request, socket, head) => {
      if (!browserServer?.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    });
    const { wsBaseUrl } = await listen(httpServer);

    const socket = await openSocket(`${wsBaseUrl}/api/browser-automation/socket`);
    socket.send(JSON.stringify({ type: 'hello', sessionToken: 'session-1' }));

    await new Promise<void>((resolve) => socket.once('close', () => resolve()));
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('handles same-port internal command requests without relying on Next route module memory', async () => {
    browserServer = new BrowserAutomationWebSocketServer({
      authenticateSessionToken: async () => ({ userId: 'user-1' }),
      internalCommandToken: 'internal-token',
    });
    httpServer = createServer((request, response) => {
      if (!browserServer?.handleRequest(request, response)) {
        response.statusCode = 404;
        response.end();
      }
    });
    httpServer.on('upgrade', (request, socket, head) => {
      if (!browserServer?.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    });
    const { httpBaseUrl, wsBaseUrl } = await listen(httpServer);

    const socket = await openSocket(`${wsBaseUrl}/api/browser-automation/socket`);
    socket.send(JSON.stringify({ type: 'hello', sessionToken: 'session-1' }));
    await expect(waitForMessage(socket)).resolves.toEqual({
      type: 'ready',
      userId: 'user-1',
    });

    const responsePromise = fetch(`${httpBaseUrl}/api/browser-automation/command`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-browser-automation-internal-token': 'internal-token',
      },
      body: JSON.stringify({
        userId: 'user-1',
        command: command(),
        timeoutMs: 1_000,
      }),
    });

    await expect(
      waitForMessage<{ type: 'command'; command: BrowserCommand }>(socket),
    ).resolves.toEqual({
      type: 'command',
      command: command(),
    });
    const result: BrowserCommandResult = { commandId: 'cmd-1', success: true };
    socket.send(JSON.stringify({ type: 'result', result }));

    const response = await responsePromise;
    await expect(response.json()).resolves.toEqual(result);
    socket.close();
  });
});
