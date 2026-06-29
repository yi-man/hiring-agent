import { createBrowserExecutorFromEnv } from './browser-executor-factory';
import { CommandTransportBrowserExecutor } from './command-transport-executor';
import { PlaywrightBrowserExecutor } from './playwright-executor';

jest.mock('./playwright-executor', () => ({
  PlaywrightBrowserExecutor: jest.fn(),
}));

const PlaywrightBrowserExecutorMock = PlaywrightBrowserExecutor as jest.MockedClass<
  typeof PlaywrightBrowserExecutor
>;

describe('createBrowserExecutorFromEnv', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates the default Playwright executor when no adapter is configured', () => {
    const executor = {};
    PlaywrightBrowserExecutorMock.mockImplementationOnce(
      () => executor as unknown as PlaywrightBrowserExecutor,
    );

    expect(createBrowserExecutorFromEnv({})).toBe(executor);
    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith();
  });

  it('creates an HTTP command adapter when configured', () => {
    const executor = createBrowserExecutorFromEnv({
      JD_PUBLISHING_BROWSER_EXECUTOR: 'http-command',
      JD_PUBLISHING_BROWSER_COMMAND_ENDPOINT: 'http://127.0.0.1:4000/browser-command',
      JD_PUBLISHING_BROWSER_COMMAND_TIMEOUT_MS: '1234',
    });

    expect(executor).toBeInstanceOf(CommandTransportBrowserExecutor);
  });

  it('rejects an HTTP command adapter without an endpoint', () => {
    expect(() =>
      createBrowserExecutorFromEnv({
        JD_PUBLISHING_BROWSER_EXECUTOR: 'http-command',
      }),
    ).toThrow(/JD_PUBLISHING_BROWSER_COMMAND_ENDPOINT is required/);
  });

  it('rejects unknown browser executor adapters', () => {
    expect(() =>
      createBrowserExecutorFromEnv({
        JD_PUBLISHING_BROWSER_EXECUTOR: 'unknown',
      }),
    ).toThrow(/unsupported browser executor adapter/);
  });
});
