const prismaMock = {
  user: {
    findUnique: jest.fn(),
  },
};

const verifyPasswordMock = jest.fn();
const createUserSessionMock = jest.fn();
const clearSessionCookieMock = jest.fn();
const getSessionFromCookieMock = jest.fn();
const ensureDefaultUserMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/lib/auth/password', () => ({
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
}));

jest.mock('@/lib/auth/local-session', () => ({
  createUserSession: (...args: unknown[]) => createUserSessionMock(...args),
  clearSessionCookie: (...args: unknown[]) => clearSessionCookieMock(...args),
  getSessionFromCookie: (...args: unknown[]) => getSessionFromCookieMock(...args),
}));

jest.mock('@/lib/auth/default-user', () => ({
  DEFAULT_USERNAME: 'xxwade',
  ensureDefaultUser: (...args: unknown[]) => ensureDefaultUserMock(...args),
}));

let login: typeof import('@/app/api/auth/login/route').POST;
let logout: typeof import('@/app/api/auth/logout/route').POST;
let session: typeof import('@/app/api/auth/session/route').GET;

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function userRecord(overrides?: Partial<{ username: string; name: string | null }>) {
  const username = overrides?.username ?? 'xxwade';
  return {
    id: 'user_123',
    username,
    passwordHash: 'stored-hash',
    name: overrides?.name ?? username,
    email: null,
    image: null,
  };
}

describe('local auth routes', () => {
  beforeAll(async () => {
    const edgeFetch = (await import('next/dist/compiled/@edge-runtime/primitives/fetch')) as {
      Request: typeof Request;
      Response: typeof Response;
    };

    Object.assign(globalThis, {
      Request: edgeFetch.Request,
      Response: edgeFetch.Response,
    });

    ({ POST: login } = await import('@/app/api/auth/login/route'));
    ({ POST: logout } = await import('@/app/api/auth/logout/route'));
    ({ GET: session } = await import('@/app/api/auth/session/route'));
  });

  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    verifyPasswordMock.mockReset();
    createUserSessionMock.mockReset();
    clearSessionCookieMock.mockReset();
    getSessionFromCookieMock.mockReset();
    ensureDefaultUserMock.mockReset();
    ensureDefaultUserMock.mockResolvedValue({ id: 'default-user' });
  });

  it('ensures the default user before logging in with default credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(userRecord());
    verifyPasswordMock.mockResolvedValueOnce(true);
    createUserSessionMock.mockResolvedValueOnce({});

    const res = await login(jsonRequest({ username: 'xxwade', password: 'hiring_2026' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user).toEqual({
      id: 'user_123',
      username: 'xxwade',
      name: 'xxwade',
      email: null,
      image: null,
    });
    expect(createUserSessionMock).toHaveBeenCalledWith('user_123');
    expect(ensureDefaultUserMock).toHaveBeenCalledTimes(1);
  });

  it('rejects if the ensured default user still cannot be found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    ensureDefaultUserMock.mockResolvedValueOnce({ id: 'default-user' });

    const res = await login(jsonRequest({ username: 'xxwade', password: 'hiring_2026' }));

    expect(res.status).toBe(401);
    expect(ensureDefaultUserMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(createUserSessionMock).not.toHaveBeenCalled();
  });

  it('does not bootstrap missing non-default users', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const res = await login(jsonRequest({ username: 'alice', password: 'hiring_2026' }));

    expect(res.status).toBe(401);
    expect(ensureDefaultUserMock).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_123',
      username: 'xxwade',
      passwordHash: 'stored-hash',
    });
    verifyPasswordMock.mockResolvedValueOnce(false);

    const res = await login(jsonRequest({ username: 'xxwade', password: 'wrong' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/invalid/i);
    expect(createUserSessionMock).not.toHaveBeenCalled();
  });

  it('validates missing credentials', async () => {
    const res = await login(jsonRequest({ username: '', password: '' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/username/i);
  });

  it('validates non-object JSON bodies', async () => {
    const res = await login(jsonRequest(null));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/json/i);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(createUserSessionMock).not.toHaveBeenCalled();
  });

  it('logs out by clearing the current session', async () => {
    const res = await logout();

    expect(res.status).toBe(200);
    expect(clearSessionCookieMock).toHaveBeenCalled();
  });

  it('returns the current session payload', async () => {
    getSessionFromCookieMock.mockResolvedValueOnce({
      user: {
        id: 'user_123',
        username: 'xxwade',
        name: 'xxwade',
        email: null,
        image: null,
      },
    });

    const res = await session();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.username).toBe('xxwade');
  });
});
