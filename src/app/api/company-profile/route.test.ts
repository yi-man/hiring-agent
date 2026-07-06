/**
 * @jest-environment node
 */
import { GET, PUT } from './route';
import { getCompanyProfileForUser, upsertCompanyProfileForUser } from '@/lib/company-profile/repo';

const requireAuthMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

jest.mock('@/lib/company-profile/repo', () => ({
  getCompanyProfileForUser: jest.fn(),
  upsertCompanyProfileForUser: jest.fn(),
}));

const getCompanyProfileForUserMock = getCompanyProfileForUser as jest.MockedFunction<
  typeof getCompanyProfileForUser
>;
const upsertCompanyProfileForUserMock = upsertCompanyProfileForUser as jest.MockedFunction<
  typeof upsertCompanyProfileForUser
>;

const profile = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
  locations: [
    {
      id: 'loc-1',
      kind: 'office' as const,
      label: '上海张江',
      city: '上海',
      address: '博云路 2 号',
      sortOrder: 0,
    },
    {
      id: 'loc-2',
      kind: 'remote' as const,
      label: '远程',
      city: null,
      address: null,
      sortOrder: 1,
    },
  ],
  createdAt: '2026-07-06T01:00:00.000Z',
  updatedAt: '2026-07-06T02:00:00.000Z',
};

describe('/api/company-profile', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getCompanyProfileForUserMock.mockReset();
    upsertCompanyProfileForUserMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns the current user company profile', async () => {
    getCompanyProfileForUserMock.mockResolvedValueOnce(profile);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.name).toBe('深海数据');
    expect(getCompanyProfileForUserMock).toHaveBeenCalledWith('u1');
  });

  it('upserts a profile for the current user', async () => {
    upsertCompanyProfileForUserMock.mockResolvedValueOnce(profile);

    const response = await PUT(
      new Request('http://localhost/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ' 深海数据 ',
          locations: [
            { kind: 'office', label: ' 上海张江 ', city: '上海', address: '博云路 2 号' },
            { kind: 'remote', label: '远程' },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.name).toBe('深海数据');
    expect(upsertCompanyProfileForUserMock).toHaveBeenCalledWith({
      userId: 'u1',
      name: '深海数据',
      locations: [
        { kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' },
        { kind: 'remote', label: '远程', city: null, address: null },
      ],
    });
  });

  it('rejects invalid profile payloads', async () => {
    const response = await PUT(
      new Request('http://localhost/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '深海数据', locations: [] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('at least one work location is required');
    expect(upsertCompanyProfileForUserMock).not.toHaveBeenCalled();
  });
});
