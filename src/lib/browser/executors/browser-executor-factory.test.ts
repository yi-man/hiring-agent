import { createBrowserExecutorFromEnv } from './browser-executor-factory';
import { CommandTransportBrowserExecutor } from './command-transport-executor';
import { PlaywrightBrowserExecutor } from './playwright-executor';
import { BrowserAutomationConnectionRegistry } from './websocket-command-registry';
import type { BrowserCommand } from '@/lib/browser/types';

jest.mock('./playwright-executor', () => ({
  PlaywrightBrowserExecutor: jest.fn(),
}));

const PlaywrightBrowserExecutorMock = PlaywrightBrowserExecutor as jest.MockedClass<
  typeof PlaywrightBrowserExecutor
>;

describe('shared createBrowserExecutorFromEnv', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates the default Playwright executor from the shared browser layer', () => {
    const executor = {};
    PlaywrightBrowserExecutorMock.mockImplementationOnce(
      () => executor as unknown as PlaywrightBrowserExecutor,
    );

    expect(createBrowserExecutorFromEnv({})).toBe(executor);
    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith();
  });

  it('uses caller default timeouts for Playwright without forcing an adapter', () => {
    const executor = {};
    PlaywrightBrowserExecutorMock.mockImplementationOnce(
      () => executor as unknown as PlaywrightBrowserExecutor,
    );

    expect(createBrowserExecutorFromEnv({}, { defaultTimeoutMs: 10_000 })).toBe(executor);
    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith({ timeoutMs: 10_000 });
  });

  it('lets env timeout override caller defaults', () => {
    const executor = {};
    PlaywrightBrowserExecutorMock.mockImplementationOnce(
      () => executor as unknown as PlaywrightBrowserExecutor,
    );

    expect(
      createBrowserExecutorFromEnv(
        {
          BROWSER_COMMAND_TIMEOUT_MS: '1234',
        },
        { defaultTimeoutMs: 10_000 },
      ),
    ).toBe(executor);
    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith({ timeoutMs: 1234 });
  });

  it('supports neutral browser executor env names before legacy JD names', () => {
    const executor = createBrowserExecutorFromEnv({
      BROWSER_EXECUTOR: 'http-command',
      BROWSER_COMMAND_ENDPOINT: 'http://127.0.0.1:4000/browser-command',
      BROWSER_COMMAND_TIMEOUT_MS: '1234',
      JD_PUBLISHING_BROWSER_EXECUTOR: 'playwright',
    });

    expect(executor).toBeInstanceOf(CommandTransportBrowserExecutor);
  });

  it('requires a user id for the same-port WebSocket browser executor', () => {
    expect(() =>
      createBrowserExecutorFromEnv({
        BROWSER_EXECUTOR: 'websocket-command',
      }),
    ).toThrow(/userId is required/);
  });

  it('routes same-port WebSocket commands through the user connection registry', async () => {
    const registry = new BrowserAutomationConnectionRegistry();
    const sent: BrowserCommand[] = [];
    registry.register('user-1', {
      sendCommand: async (command) => {
        sent.push(command);
        return { commandId: command.id, success: true };
      },
      close: jest.fn(),
    });

    const executor = createBrowserExecutorFromEnv(
      {
        BROWSER_EXECUTOR: 'websocket-command',
        BROWSER_COMMAND_TIMEOUT_MS: '1234',
      },
      {
        userId: 'user-1',
        registry,
      },
    );

    await expect(executor.navigate('https://example.com/jobs/new')).resolves.toEqual({
      success: true,
      error: undefined,
      domSnapshot: undefined,
      match: undefined,
      failedTargetKey: undefined,
    });
    expect(sent).toEqual([
      expect.objectContaining({
        action: 'navigate',
        params: { url: 'https://example.com/jobs/new' },
        timeoutMs: 1234,
      }),
    ]);
  });
});
