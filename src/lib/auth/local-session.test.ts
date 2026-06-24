type MockCookieStore = {
  value: string | undefined;
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
};

type MockPrisma = {
  session: {
    create: jest.Mock;
    findUnique: jest.Mock;
    deleteMany: jest.Mock;
  };
  user: {
    upsert: jest.Mock;
  };
};

// Jest hoists mock factories before module imports; these references are assigned inside factories.
// eslint-disable-next-line no-var
var mockCookieStore: MockCookieStore;
// eslint-disable-next-line no-var
var mockPrisma: MockPrisma;

jest.mock('next/headers', () => {
  mockCookieStore = {
    value: undefined,
    get: jest.fn((name: string) =>
      name === 'hiring-agent.session' && mockCookieStore.value
        ? { name, value: mockCookieStore.value }
        : undefined,
    ),
    set: jest.fn(),
    delete: jest.fn(),
  };

  return {
    cookies: jest.fn(async () => mockCookieStore),
  };
});

jest.mock('@/lib/prisma', () => {
  mockPrisma = {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      upsert: jest.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

jest.mock('@/lib/auth/password', () => ({
  hashPassword: jest.fn(async () => 'pbkdf2_sha256$test'),
}));

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createUserSession,
  getSessionFromCookie,
} from '@/lib/auth/local-session';
import { ensureDefaultUser } from '@/lib/auth/default-user';

describe('local auth sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCookieStore.value = undefined;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
    });
  });

  it('creates a session and sets an http-only cookie', async () => {
    mockPrisma.session.create.mockResolvedValueOnce({});

    const session = await createUserSession('user_123');

    expect(session.token).toHaveLength(64);
    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: {
        sessionToken: session.token,
        userId: 'user_123',
        expires: expect.any(Date),
      },
    });
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      session.token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      }),
    );
  });

  it('returns null when the session cookie is missing', async () => {
    await expect(getSessionFromCookie()).resolves.toBeNull();
  });

  it('returns the user for a valid unexpired session', async () => {
    mockCookieStore.value = 'token';
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      sessionToken: 'token',
      expires: new Date(Date.now() + 60_000),
      user: {
        id: 'user_123',
        username: 'xxwade',
        name: 'xxwade',
        email: null,
        image: null,
      },
    });

    await expect(getSessionFromCookie()).resolves.toEqual({
      user: {
        id: 'user_123',
        username: 'xxwade',
        name: 'xxwade',
        email: null,
        image: null,
      },
    });
  });

  it('deletes expired sessions and returns null', async () => {
    mockCookieStore.value = 'expired-token';
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      sessionToken: 'expired-token',
      expires: new Date(Date.now() - 60_000),
      user: { id: 'user_123' },
    });

    await expect(getSessionFromCookie()).resolves.toBeNull();
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionToken: 'expired-token' },
    });
  });

  it('clears the session cookie and deletes the database session', async () => {
    mockCookieStore.value = 'token';

    await clearSessionCookie();

    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionToken: 'token' },
    });
    expect(mockCookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });
});

describe('default user provisioning', () => {
  it('upserts the xxwade default user', async () => {
    mockPrisma.user.upsert.mockResolvedValueOnce({
      id: 'default-user',
      username: 'xxwade',
      name: 'xxwade',
    });

    await expect(ensureDefaultUser()).resolves.toEqual(
      expect.objectContaining({ username: 'xxwade' }),
    );
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
      where: { username: 'xxwade' },
      update: {
        name: 'xxwade',
        passwordHash: 'pbkdf2_sha256$test',
      },
      create: {
        username: 'xxwade',
        name: 'xxwade',
        passwordHash: 'pbkdf2_sha256$test',
      },
    });
  });
});
