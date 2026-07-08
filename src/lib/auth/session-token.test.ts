type MockPrisma = {
  session: {
    findUnique: jest.Mock;
    deleteMany: jest.Mock;
  };
};

// Jest hoists mock factories before module imports; this reference is assigned inside factories.
// eslint-disable-next-line no-var
var mockPrisma: MockPrisma;

jest.mock('@/lib/prisma', () => {
  mockPrisma = {
    session: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

import { authenticateSessionToken } from '@/lib/auth/session-token';

describe('authenticateSessionToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for blank tokens without querying the database', async () => {
    await expect(authenticateSessionToken('   ')).resolves.toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('returns the user id for a valid unexpired token', async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      expires: new Date(Date.now() + 60_000),
    });

    await expect(authenticateSessionToken('token-1')).resolves.toEqual({ userId: 'user-1' });
    expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
      where: { sessionToken: 'token-1' },
      select: {
        userId: true,
        expires: true,
      },
    });
  });

  it('deletes expired tokens and returns null', async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      expires: new Date(Date.now() - 60_000),
    });

    await expect(authenticateSessionToken('expired-token')).resolves.toBeNull();
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionToken: 'expired-token' },
    });
  });
});
