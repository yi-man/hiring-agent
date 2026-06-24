import { getSessionFromCookie } from '@/lib/auth/local-session';
import { getServerAuthSession, requireAuth, UnauthorizedError } from '@/lib/auth/session';

jest.mock('@/lib/auth/local-session', () => ({
  getSessionFromCookie: jest.fn(),
}));

const getSessionFromCookieMock = getSessionFromCookie as jest.MockedFunction<
  typeof getSessionFromCookie
>;

describe('auth guard helpers', () => {
  beforeEach(() => {
    getSessionFromCookieMock.mockReset();
  });

  it('returns null from getServerAuthSession when session is missing', async () => {
    getSessionFromCookieMock.mockResolvedValueOnce(null);

    const session = await getServerAuthSession();

    expect(session).toBeNull();
  });

  it('throws UnauthorizedError from requireAuth when session is missing', async () => {
    getSessionFromCookieMock.mockResolvedValueOnce(null);

    const authPromise = requireAuth();

    await expect(authPromise).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(authPromise).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('returns normalized auth context with user.id for authenticated requests', async () => {
    getSessionFromCookieMock.mockResolvedValueOnce({
      user: {
        id: 'user_123',
        username: 'xxwade',
        name: 'xxwade',
        email: null,
        image: null,
      },
    });

    const auth = await requireAuth();

    expect(auth).toEqual({
      user: {
        id: 'user_123',
      },
    });
  });
});
