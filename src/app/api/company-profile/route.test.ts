/**
 * @jest-environment node
 */
import { GET, PATCH, PUT } from './route';
import {
  getCompanyProfileForUser,
  updateCompanyRecruitmentPlatformsForUser,
  upsertCompanyProfileForUser,
} from '@/lib/company-profile/repo';
import { listRecruitmentPlatformMetadata } from '@/lib/recruitment-platform-config';

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
  updateCompanyRecruitmentPlatformsForUser: jest.fn(),
  upsertCompanyProfileForUser: jest.fn(),
}));

jest.mock('@/lib/recruitment-platform-config', () => ({
  listRecruitmentPlatformMetadata: jest.fn(),
}));

const getCompanyProfileForUserMock = getCompanyProfileForUser as jest.MockedFunction<
  typeof getCompanyProfileForUser
>;
const upsertCompanyProfileForUserMock = upsertCompanyProfileForUser as jest.MockedFunction<
  typeof upsertCompanyProfileForUser
>;
const updateCompanyRecruitmentPlatformsForUserMock =
  updateCompanyRecruitmentPlatformsForUser as jest.MockedFunction<
    typeof updateCompanyRecruitmentPlatformsForUser
  >;
const listRecruitmentPlatformMetadataMock = listRecruitmentPlatformMetadata as jest.MockedFunction<
  typeof listRecruitmentPlatformMetadata
>;

const profile = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
  supportedPlatforms: ['boss' as const, 'liepin' as const],
  platformConfigs: [],
  interviewProcesses: [],
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
    updateCompanyRecruitmentPlatformsForUserMock.mockReset();
    listRecruitmentPlatformMetadataMock.mockReset();
    listRecruitmentPlatformMetadataMock.mockResolvedValue([]);
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
          supportedPlatforms: ['boss', 'liepin'],
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
      supportedPlatforms: ['boss', 'liepin'],
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

  it('updates only recruitment platform connections', async () => {
    getCompanyProfileForUserMock.mockResolvedValueOnce(profile);
    listRecruitmentPlatformMetadataMock.mockResolvedValueOnce([
      {
        id: 'boss',
        label: 'BOSS 直聘',
        shortLabel: 'BOSS',
        description: 'BOSS 直聘企业端',
        kind: 'production',
        defaultBaseUrl: 'https://www.zhipin.com',
        defaultVariables: {},
      },
      {
        id: 'liepin',
        label: '猎聘',
        shortLabel: '猎聘',
        description: '猎聘企业端',
        kind: 'production',
        defaultBaseUrl: 'https://lpt.liepin.com',
        defaultVariables: {},
      },
    ]);
    updateCompanyRecruitmentPlatformsForUserMock.mockResolvedValueOnce(profile);

    const response = await PATCH(
      new Request('http://localhost/api/company-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformConfigs: [
            {
              platformId: 'boss',
              baseUrl: 'https://www.zhipin.com',
              username: 'operator',
              variables: {},
            },
            {
              platformId: 'liepin',
              baseUrl: 'https://lpt.liepin.com',
              username: '',
              variables: {},
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateCompanyRecruitmentPlatformsForUserMock).toHaveBeenCalledWith({
      userId: 'u1',
      platformConfigs: [
        {
          platformId: 'boss',
          baseUrl: 'https://www.zhipin.com',
          username: 'operator',
          variables: {},
        },
        {
          platformId: 'liepin',
          baseUrl: 'https://lpt.liepin.com',
          username: '',
          variables: {},
        },
      ],
    });
  });
});
