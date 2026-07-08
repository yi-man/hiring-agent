import { createBrowserExecutorFromEnv } from './browser-executor-factory';
import { CommandTransportBrowserExecutor } from './command-transport-executor';
import { PlaywrightBrowserExecutor } from './playwright-executor';

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
});
