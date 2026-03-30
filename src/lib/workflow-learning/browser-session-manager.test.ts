import { BrowserSessionManager } from './browser-session-manager';

const mockPage = {
  title: jest.fn().mockResolvedValue('Test Page'),
  url: jest.fn().mockReturnValue('https://example.com'),
  goto: jest.fn().mockResolvedValue(null),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
};

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

describe('BrowserSessionManager', () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    manager = new BrowserSessionManager();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await manager.shutdownAll();
  });

  it('creates a new session for a new userId', async () => {
    const session = await manager.getOrCreate('user-1');
    expect(session.page).toBe(mockPage);
    expect(session.userId).toBe('user-1');
  });

  it('reuses existing session for same userId', async () => {
    const s1 = await manager.getOrCreate('user-1');
    const s2 = await manager.getOrCreate('user-1');
    expect(s1).toBe(s2);
    const { chromium } = await import('playwright');
    expect(chromium.launch).toHaveBeenCalledTimes(1);
  });

  it('creates separate sessions for different userIds', async () => {
    const s1 = await manager.getOrCreate('user-1');
    const s2 = await manager.getOrCreate('user-2');
    expect(s1).not.toBe(s2);
  });

  it('close removes session', async () => {
    await manager.getOrCreate('user-1');
    expect(manager.isActive('user-1')).toBe(true);
    await manager.close('user-1');
    expect(manager.isActive('user-1')).toBe(false);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('shutdownAll closes all sessions', async () => {
    await manager.getOrCreate('user-1');
    await manager.getOrCreate('user-2');
    await manager.shutdownAll();
    expect(manager.isActive('user-1')).toBe(false);
    expect(manager.isActive('user-2')).toBe(false);
  });

  it('detects disconnected browser', async () => {
    await manager.getOrCreate('user-1');
    mockBrowser.isConnected.mockReturnValue(false);
    const status = manager.getStatus('user-1');
    expect(status).toBeNull();
  });
});
