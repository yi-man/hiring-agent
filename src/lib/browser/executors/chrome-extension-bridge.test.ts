/**
 * @jest-environment node
 */
import { ChromeExtensionBridgeServer } from './chrome-extension-bridge';
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

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('ChromeExtensionBridgeServer', () => {
  let bridge: ChromeExtensionBridgeServer | undefined;

  afterEach(async () => {
    await bridge?.close();
    bridge = undefined;
  });

  it('holds a browser command request until the extension posts a matching result', async () => {
    bridge = new ChromeExtensionBridgeServer({
      commandTimeoutMs: 1_000,
      pollTimeoutMs: 50,
    });
    await bridge.listen();

    const sentCommand = command();
    const appRequest = fetch(bridge.commandEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sentCommand),
    });

    const nextResponse = await fetch(bridge.nextCommandEndpoint);
    expect(nextResponse.status).toBe(200);
    await expect(readJson<BrowserCommand>(nextResponse)).resolves.toEqual(sentCommand);

    const result: BrowserCommandResult = {
      commandId: sentCommand.id,
      success: true,
      match: {
        target: sentCommand.target!,
        status: 'unique',
        strategy: 'extension_dom',
        candidateCount: 1,
        confidence: 0.95,
        candidates: [],
      },
    };
    const resultResponse = await fetch(bridge.resultEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result),
    });
    expect(resultResponse.status).toBe(204);

    await expect(readJson<BrowserCommandResult>(await appRequest)).resolves.toEqual(result);
  });

  it('returns 204 to extension polling when no command is pending', async () => {
    bridge = new ChromeExtensionBridgeServer({
      commandTimeoutMs: 1_000,
      pollTimeoutMs: 10,
    });
    await bridge.listen();

    const response = await fetch(bridge.nextCommandEndpoint);

    expect(response.status).toBe(204);
  });

  it('unblocks the app request when the extension does not answer in time', async () => {
    bridge = new ChromeExtensionBridgeServer({
      commandTimeoutMs: 20,
      pollTimeoutMs: 10,
    });
    await bridge.listen();

    const response = await fetch(bridge.commandEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command('cmd-timeout')),
    });

    expect(response.status).toBe(200);
    await expect(readJson<BrowserCommandResult>(response)).resolves.toEqual({
      commandId: 'cmd-timeout',
      success: false,
      error: 'chrome_extension_command_timeout',
    });
  });

  it('answers CORS preflight requests from the Chrome extension', async () => {
    bridge = new ChromeExtensionBridgeServer({
      commandTimeoutMs: 1_000,
      pollTimeoutMs: 10,
    });
    await bridge.listen();

    const response = await fetch(bridge.resultEndpoint, {
      method: 'OPTIONS',
      headers: { origin: 'chrome-extension://example' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('chrome-extension://example');
  });

  it('does not grant browser CORS access to web page origins', async () => {
    bridge = new ChromeExtensionBridgeServer({
      commandTimeoutMs: 1_000,
      pollTimeoutMs: 10,
    });
    await bridge.listen();

    const response = await fetch(bridge.commandEndpoint, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.com' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
