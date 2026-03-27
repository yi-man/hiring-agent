jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}));

jest.mock('@auth/prisma-adapter', () => ({
  __esModule: true,
  PrismaAdapter: jest.fn(() => ({})),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { authOptions } from '@/auth';

describe('auth session callback contract', () => {
  it('returns session.user.id when user exists', async () => {
    const sessionCallback = authOptions.callbacks?.session;

    expect(sessionCallback).toBeDefined();

    if (!sessionCallback) {
      throw new Error('Expected session callback to be defined');
    }

    const result = await sessionCallback({
      session: {
        user: {
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
        },
        expires: '2099-01-01T00:00:00.000Z',
      },
      user: {
        id: 'user_123',
        name: 'Alice',
        email: 'alice@example.com',
        emailVerified: null,
        image: null,
      },
      token: {},
      newSession: {},
      trigger: 'update',
    });

    expect(result.user.id).toBe('user_123');
  });
});
