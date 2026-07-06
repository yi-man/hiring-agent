import { getCompanyProfileForUser, upsertCompanyProfileForUser } from '@/lib/company-profile/repo';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    companyProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    companyProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
};

const profileRow = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
  createdAt: new Date('2026-07-06T01:00:00.000Z'),
  updatedAt: new Date('2026-07-06T02:00:00.000Z'),
  locations: [
    {
      id: 'loc-1',
      companyProfileId: 'profile-1',
      kind: 'office',
      label: '上海张江',
      city: '上海',
      address: '博云路 2 号',
      sortOrder: 0,
      createdAt: new Date('2026-07-06T01:00:00.000Z'),
      updatedAt: new Date('2026-07-06T02:00:00.000Z'),
    },
    {
      id: 'loc-2',
      companyProfileId: 'profile-1',
      kind: 'remote',
      label: '远程',
      city: null,
      address: null,
      sortOrder: 1,
      createdAt: new Date('2026-07-06T01:00:00.000Z'),
      updatedAt: new Date('2026-07-06T02:00:00.000Z'),
    },
  ],
};

describe('company profile repository', () => {
  beforeEach(() => {
    prismaMock.companyProfile.findUnique.mockReset();
    prismaMock.companyProfile.upsert.mockReset();
  });

  it('gets the current user profile with ordered locations', async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce(profileRow);

    const result = await getCompanyProfileForUser('u1');

    expect(prismaMock.companyProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { locations: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    expect(result).toEqual({
      id: 'profile-1',
      userId: 'u1',
      name: '深海数据',
      locations: [
        {
          id: 'loc-1',
          kind: 'office',
          label: '上海张江',
          city: '上海',
          address: '博云路 2 号',
          sortOrder: 0,
        },
        {
          id: 'loc-2',
          kind: 'remote',
          label: '远程',
          city: null,
          address: null,
          sortOrder: 1,
        },
      ],
      createdAt: '2026-07-06T01:00:00.000Z',
      updatedAt: '2026-07-06T02:00:00.000Z',
    });
  });

  it('upserts the current user profile and replaces locations atomically', async () => {
    prismaMock.companyProfile.upsert.mockResolvedValueOnce(profileRow);

    const result = await upsertCompanyProfileForUser({
      userId: 'u1',
      name: '深海数据',
      locations: [
        { kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' },
        { kind: 'remote', label: '远程', city: null, address: null },
      ],
    });

    expect(prismaMock.companyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      update: {
        name: '深海数据',
        locations: {
          deleteMany: {},
          create: [
            {
              kind: 'office',
              label: '上海张江',
              city: '上海',
              address: '博云路 2 号',
              sortOrder: 0,
            },
            {
              kind: 'remote',
              label: '远程',
              city: null,
              address: null,
              sortOrder: 1,
            },
          ],
        },
      },
      create: {
        userId: 'u1',
        name: '深海数据',
        locations: {
          create: [
            {
              kind: 'office',
              label: '上海张江',
              city: '上海',
              address: '博云路 2 号',
              sortOrder: 0,
            },
            {
              kind: 'remote',
              label: '远程',
              city: null,
              address: null,
              sortOrder: 1,
            },
          ],
        },
      },
      include: { locations: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    expect(result?.name).toBe('深海数据');
  });
});
