import { createWorkflowBrowserTools } from './browser-tools';

describe('createWorkflowBrowserTools', () => {
  it('exposes stateful snapshot, login, and verification tools', () => {
    const tools = createWorkflowBrowserTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'browser_snapshot',
      'browser_open_login',
      'browser_verify_login',
    ]);
  });

  it('defaults tool calls to the request session id', async () => {
    const manager = {
      snapshot: jest.fn(async () => ({
        title: 'Example',
        excerpt: 'Body',
        url: 'https://example.com',
      })),
      openLogin: jest.fn(),
      verifyLogin: jest.fn(),
    };
    const [snapshot] = createWorkflowBrowserTools(manager as never, 'request-session') as Array<{
      invoke(input: unknown): Promise<unknown>;
    }>;

    await snapshot.invoke({ url: 'https://example.com' });

    expect(manager.snapshot).toHaveBeenCalledWith({
      sessionId: 'request-session',
      url: 'https://example.com',
    });
  });
});
