import { getServerSession } from 'next-auth/next';
import { getServerAuthSession, requireAuth, UnauthorizedError } from '@/lib/auth/session';

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/auth', () => ({
  authOptions: {},
}));

const getServerSessionMock = getServerSession as jest.MockedFunction<typeof getServerSession>;

describe('auth guard helpers', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  it('returns null from getServerAuthSession when session is missing', async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const session = await getServerAuthSession();

    expect(session).toBeNull();
  });

  it('throws UnauthorizedError from requireAuth when session is missing', async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const authPromise = requireAuth();

    await expect(authPromise).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(authPromise).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('returns normalized auth context with user.id for authenticated requests', async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: {
        id: 'user_123',
        email: 'alice@example.com',
      },
      expires: '2099-01-01T00:00:00.000Z',
    } as never);

    const auth = await requireAuth();

    expect(auth).toEqual({
      user: {
        id: 'user_123',
      },
    });
  });
});
