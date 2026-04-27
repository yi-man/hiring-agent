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

  it('passes textNotIncludes criteria to login verification', async () => {
    const manager = {
      snapshot: jest.fn(),
      openLogin: jest.fn(),
      verifyLogin: jest.fn(async () => ({
        sessionId: 'request-session',
        loggedIn: true,
        url: 'https://example.com/messages',
        excerpt: '消息列表',
      })),
    };
    const [, , verifyLogin] = createWorkflowBrowserTools(
      manager as never,
      'request-session',
    ) as Array<{
      invoke(input: unknown): Promise<unknown>;
    }>;

    await verifyLogin.invoke({
      success: {
        textNotIncludes: ['扫码登录'],
      },
      timeoutMs: 100,
    });

    expect(manager.verifyLogin).toHaveBeenCalledWith({
      sessionId: 'request-session',
      success: {
        textNotIncludes: ['扫码登录'],
      },
      timeoutMs: 100,
    });
  });
});
