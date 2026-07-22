import {
  createSiteFingerprint,
  findDuplicateRecruitmentPlatformTarget,
  listRecruitmentPlatformMetadata,
  resolveRecruitmentPlatformRuntimeConfig,
  resolveRecruitmentPlatformRuntimeConfigs,
} from './recruitment-platform-config';
import { decryptPlatformPassword } from './platform-credentials';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    recruitmentPlatform: { findMany: jest.fn() },
    companyProfile: { findUnique: jest.fn() },
  },
}));

jest.mock('./platform-credentials', () => ({
  decryptPlatformPassword: jest.fn(),
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    recruitmentPlatform: { findMany: jest.Mock };
    companyProfile: { findUnique: jest.Mock };
  };
};
const decryptPlatformPasswordMock = decryptPlatformPassword as jest.MockedFunction<
  typeof decryptPlatformPassword
>;

const platforms = [
  {
    id: 'zhilian',
    label: '智联招聘',
    shortLabel: '智联',
    description: '智联招聘企业端',
    kind: 'production',
    defaultBaseUrl: 'https://rd6.zhaopin.com',
    defaultVariables: { resumeListPath: '/app/talent/search' },
  },
  {
    id: 'boss-like',
    label: 'BOSS-like（本地）',
    shortLabel: 'BOSS-like',
    description: '本地招聘站',
    kind: 'local',
    defaultBaseUrl: 'http://localhost:6183',
    defaultVariables: {
      resumeListPath: '/employer/resumes',
      messagePath: '/employer/messages',
    },
  },
];

describe('recruitment platform configuration', () => {
  beforeEach(() => {
    prismaMock.recruitmentPlatform.findMany.mockReset();
    prismaMock.companyProfile.findUnique.mockReset();
    decryptPlatformPasswordMock.mockReset();
    prismaMock.recruitmentPlatform.findMany.mockResolvedValue(platforms);
  });

  it('loads the platform catalog from the database', async () => {
    await expect(listRecruitmentPlatformMetadata()).resolves.toEqual(platforms);
    expect(prismaMock.recruitmentPlatform.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('derives the site template and skill fingerprint from the configured address', async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce({
      recruitmentPlatforms: [
        {
          platformId: 'zhilian',
          baseUrl: 'http://localhost:6183',
          username: 'admin',
          passwordEncrypted: 'ciphertext',
          variables: {},
        },
      ],
    });
    decryptPlatformPasswordMock.mockReturnValueOnce('boss123');

    const result = await resolveRecruitmentPlatformRuntimeConfig({
      userId: 'u1',
      platform: 'zhilian',
    });

    expect(result).toEqual({
      platform: 'zhilian',
      baseUrl: 'http://localhost:6183',
      username: 'admin',
      password: 'boss123',
      variables: {
        resumeListPath: '/employer/resumes',
        messagePath: '/employer/messages',
      },
      siteFingerprint: createSiteFingerprint('http://localhost:6183', {
        resumeListPath: '/employer/resumes',
        messagePath: '/employer/messages',
      }),
      siteTemplatePlatform: 'boss-like',
    });
  });

  it('loads multiple platform targets with one catalog and profile query', async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValueOnce({
      recruitmentPlatforms: [
        {
          platformId: 'zhilian',
          baseUrl: 'http://localhost:6183',
          username: 'admin',
          passwordEncrypted: 'ciphertext',
          variables: {},
        },
      ],
    });
    decryptPlatformPasswordMock.mockReturnValueOnce('boss123');

    const result = await resolveRecruitmentPlatformRuntimeConfigs({
      userId: 'u1',
      platforms: ['zhilian', 'boss-like'],
    });

    expect(result.map((config) => config.platform)).toEqual(['zhilian', 'boss-like']);
    expect(result[0]?.siteFingerprint).toBe(result[1]?.siteFingerprint);
    expect(prismaMock.recruitmentPlatform.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.companyProfile.findUnique).toHaveBeenCalledTimes(1);
  });

  it('identifies the first pair of platforms that target the same site', () => {
    const duplicate = findDuplicateRecruitmentPlatformTarget([
      {
        platform: 'zhilian',
        baseUrl: 'http://localhost:6183',
        username: 'admin',
        password: 'boss123',
        variables: {},
        siteFingerprint: 'same-site',
        siteTemplatePlatform: 'boss-like',
      },
      {
        platform: 'boss-like',
        baseUrl: 'http://localhost:6183',
        username: 'admin',
        password: 'boss123',
        variables: {},
        siteFingerprint: 'same-site',
        siteTemplatePlatform: 'boss-like',
      },
    ]);

    expect(duplicate).toEqual(['zhilian', 'boss-like']);
  });
});
