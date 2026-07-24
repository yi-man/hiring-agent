import {
  getCompanyProfileForUser,
  updateCompanyRecruitmentPlatformsForUser,
  upsertCompanyProfileForUser,
} from '@/lib/company-profile/repo';
import { backfillMissingJobDescriptionInterviewProcesses } from '@/lib/jd/interview-process-backfill';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    companyProfile: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
    },
    companyRecruitmentPlatform: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/recruitment-platform-config', () => ({
  listRecruitmentPlatformMetadata: jest.fn().mockResolvedValue([
    {
      id: 'boss',
      label: 'BOSS 直聘',
      shortLabel: 'BOSS',
      description: 'BOSS',
      kind: 'production',
      defaultBaseUrl: 'https://www.zhipin.com',
      defaultVariables: {},
    },
    {
      id: 'liepin',
      label: '猎聘',
      shortLabel: '猎聘',
      description: '猎聘',
      kind: 'production',
      defaultBaseUrl: 'https://lpt.liepin.com',
      defaultVariables: {},
    },
  ]),
  toJsonRecord: (value: unknown) => value,
}));

jest.mock('@/lib/jd/interview-process-backfill', () => ({
  backfillMissingJobDescriptionInterviewProcesses: jest.fn(),
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    $transaction: jest.Mock;
    companyProfile: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      upsert: jest.Mock;
    };
    companyRecruitmentPlatform: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
};

const backfillMissingJobDescriptionInterviewProcessesMock =
  backfillMissingJobDescriptionInterviewProcesses as jest.MockedFunction<
    typeof backfillMissingJobDescriptionInterviewProcesses
  >;

const technicalInterviewProcess = {
  id: 'technical',
  positionType: '技术研发类',
  autoMatch: {
    departments: ['技术部'],
    positionKeywords: ['工程师'],
    isFallback: false,
  },
  stages: [{ id: 'technical', name: '技术面', purpose: '验证技术能力', sortOrder: 0 }],
};

const profileRow = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
  supportedPlatforms: ['boss', 'liepin'],
  interviewProcesses: [],
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
  recruitmentPlatforms: [],
};

describe('company profile repository', () => {
  beforeEach(() => {
    prismaMock.companyProfile.findUnique.mockReset();
    prismaMock.companyProfile.findUniqueOrThrow.mockReset();
    prismaMock.companyProfile.upsert.mockReset();
    prismaMock.companyRecruitmentPlatform.upsert.mockReset();
    prismaMock.companyRecruitmentPlatform.deleteMany.mockReset();
    backfillMissingJobDescriptionInterviewProcessesMock.mockReset();
    backfillMissingJobDescriptionInterviewProcessesMock.mockResolvedValue({
      scannedCount: 0,
      matchedCount: 0,
      updatedCount: 0,
    });
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    );
  });

  it('gets the current user profile with ordered locations', async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce(profileRow);

    const result = await getCompanyProfileForUser('u1');

    expect(prismaMock.companyProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: {
        locations: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        recruitmentPlatforms: { orderBy: { createdAt: 'asc' } },
      },
    });
    expect(result).toEqual({
      id: 'profile-1',
      userId: 'u1',
      name: '深海数据',
      supportedPlatforms: ['boss', 'liepin'],
      platformConfigs: [],
      interviewProcesses: [],
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
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyProfile.upsert.mockResolvedValueOnce({ id: 'profile-1' });
    prismaMock.companyProfile.findUniqueOrThrow.mockResolvedValueOnce(profileRow);

    const result = await upsertCompanyProfileForUser({
      userId: 'u1',
      name: '深海数据',
      supportedPlatforms: ['boss', 'liepin'],
      locations: [
        { kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' },
        { kind: 'remote', label: '远程', city: null, address: null },
      ],
    });

    expect(prismaMock.companyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      update: {
        name: '深海数据',
        supportedPlatforms: ['boss', 'liepin'],
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
        supportedPlatforms: ['boss', 'liepin'],
        interviewProcesses: [],
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
    });
    expect(prismaMock.companyRecruitmentPlatform.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.companyRecruitmentPlatform.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ update: {} }),
    );
    expect(prismaMock.companyRecruitmentPlatform.deleteMany).not.toHaveBeenCalled();
    expect(result?.name).toBe('深海数据');
  });

  it('updates platform connections without changing company fields', async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce(profileRow);
    prismaMock.companyProfile.findUniqueOrThrow.mockResolvedValueOnce(profileRow);

    await updateCompanyRecruitmentPlatformsForUser({
      userId: 'u1',
      platformConfigs: [
        {
          platformId: 'boss',
          baseUrl: 'http://localhost:6183',
          username: 'operator',
          variables: { resumeListPath: '/employer/resumes' },
        },
      ],
    });

    expect(prismaMock.companyProfile.upsert).not.toHaveBeenCalled();
    expect(prismaMock.companyRecruitmentPlatform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          companyProfileId: 'profile-1',
          platformId: 'boss',
          baseUrl: 'http://localhost:6183',
          username: 'operator',
        }),
        update: expect.objectContaining({
          baseUrl: 'http://localhost:6183',
          username: 'operator',
          variables: { resumeListPath: '/employer/resumes' },
        }),
      }),
    );
  });

  it('backfills historical JDs when interview process templates are saved', async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce(profileRow);
    prismaMock.companyProfile.upsert.mockResolvedValueOnce({ id: 'profile-1' });
    prismaMock.companyProfile.findUniqueOrThrow.mockResolvedValueOnce({
      ...profileRow,
      interviewProcesses: [technicalInterviewProcess],
    });

    await upsertCompanyProfileForUser({
      userId: 'u1',
      name: '深海数据',
      supportedPlatforms: ['boss', 'liepin'],
      locations: [{ kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' }],
      interviewProcesses: [technicalInterviewProcess],
    });

    expect(backfillMissingJobDescriptionInterviewProcessesMock).toHaveBeenCalledWith({
      client: prismaMock,
      userId: 'u1',
      interviewProcesses: [technicalInterviewProcess],
    });
  });
});
