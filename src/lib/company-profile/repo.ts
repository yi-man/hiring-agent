import { prisma } from '@/lib/prisma';
import { normalizeCompanyWorkLocations } from './api';
import type {
  CompanyProfileDto,
  UpdateCompanyRecruitmentPlatformsParams,
  UpsertCompanyProfileParams,
} from './types';
import { normalizeRecruitmentPlatforms } from '@/lib/recruitment-platforms';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';
import { encryptPlatformPassword } from '@/lib/platform-credentials';
import { listRecruitmentPlatformMetadata, toJsonRecord } from '@/lib/recruitment-platform-config';

type CompanyProfileRow = {
  id: string;
  userId: string;
  name: string;
  supportedPlatforms?: string[];
  createdAt: Date;
  updatedAt: Date;
  locations: Array<{
    id: string;
    kind: string;
    label: string;
    city: string | null;
    address: string | null;
    sortOrder: number;
  }>;
  recruitmentPlatforms?: Array<{
    id: string;
    platformId: string;
    baseUrl: string;
    username: string | null;
    passwordEncrypted: string | null;
    variables: unknown;
  }>;
};

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => (typeof item === 'string' ? [[key, item]] : [])),
  );
}

const locationsOrderBy = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

function mapProfile(row: CompanyProfileRow | null): CompanyProfileDto | null {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    supportedPlatforms: normalizeRecruitmentPlatforms(row.supportedPlatforms),
    platformConfigs: (row.recruitmentPlatforms ?? []).map((config) => ({
      id: config.id,
      platformId: config.platformId as RecruitmentPlatform,
      baseUrl: config.baseUrl,
      username: config.username ?? '',
      hasPassword: Boolean(config.passwordEncrypted),
      variables: stringRecord(config.variables),
    })),
    locations: row.locations.map((location) => ({
      id: location.id,
      kind: location.kind === 'remote' ? 'remote' : 'office',
      label: location.label,
      city: location.city,
      address: location.address,
      sortOrder: location.sortOrder,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getCompanyProfileForUser(userId: string): Promise<CompanyProfileDto | null> {
  const row = await prisma.companyProfile.findUnique({
    where: { userId },
    include: {
      locations: { orderBy: locationsOrderBy },
      recruitmentPlatforms: { orderBy: { createdAt: 'asc' } },
    },
  });

  return mapProfile(row as CompanyProfileRow | null);
}

export async function upsertCompanyProfileForUser(
  params: UpsertCompanyProfileParams,
): Promise<CompanyProfileDto> {
  const platformMetadata = await listRecruitmentPlatformMetadata();
  const metadataById = new Map(platformMetadata.map((platform) => [platform.id, platform]));
  const inputByPlatform = new Map(
    (params.platformConfigs ?? []).map((config) => [config.platformId, config]),
  );
  const current = await prisma.companyProfile.findUnique({
    where: { userId: params.userId },
    include: { recruitmentPlatforms: true },
  });
  const currentByPlatform = new Map(
    current?.recruitmentPlatforms.map((config) => [config.platformId, config]) ?? [],
  );
  const shouldUpdatePlatformConfigs = params.platformConfigs !== undefined;
  const locations = normalizeCompanyWorkLocations(params.locations);
  const locationCreateData = locations.map((location) => ({
    kind: location.kind,
    label: location.label,
    city: location.city,
    address: location.address,
    sortOrder: location.sortOrder,
  }));

  const row = await prisma.$transaction(async (tx) => {
    const profile = await tx.companyProfile.upsert({
      where: { userId: params.userId },
      update: {
        name: params.name,
        supportedPlatforms: params.supportedPlatforms,
        locations: { deleteMany: {}, create: locationCreateData },
      },
      create: {
        userId: params.userId,
        name: params.name,
        supportedPlatforms: params.supportedPlatforms,
        locations: { create: locationCreateData },
      },
    });

    for (const platformId of params.supportedPlatforms) {
      const metadata = metadataById.get(platformId);
      if (!metadata) throw new Error(`recruitment platform is unavailable: ${platformId}`);
      const input = inputByPlatform.get(platformId);
      const existing = currentByPlatform.get(platformId);
      const passwordEncrypted = input?.clearPassword
        ? null
        : input?.password
          ? encryptPlatformPassword(input.password)
          : (existing?.passwordEncrypted ?? null);
      await tx.companyRecruitmentPlatform.upsert({
        where: {
          companyProfileId_platformId: {
            companyProfileId: profile.id,
            platformId,
          },
        },
        create: {
          companyProfileId: profile.id,
          platformId,
          baseUrl: input?.baseUrl || metadata.defaultBaseUrl,
          username: input?.username || null,
          passwordEncrypted,
          variables: toJsonRecord(input?.variables ?? {}),
        },
        update: shouldUpdatePlatformConfigs
          ? {
              baseUrl: input?.baseUrl || existing?.baseUrl || metadata.defaultBaseUrl,
              username: input?.username || null,
              passwordEncrypted,
              variables: toJsonRecord(input?.variables ?? stringRecord(existing?.variables)),
            }
          : {},
      });
    }

    return tx.companyProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: {
        locations: { orderBy: locationsOrderBy },
        recruitmentPlatforms: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  return mapProfile(row as CompanyProfileRow) as CompanyProfileDto;
}

export async function updateCompanyRecruitmentPlatformsForUser(
  params: UpdateCompanyRecruitmentPlatformsParams,
): Promise<CompanyProfileDto> {
  const [platformMetadata, current] = await Promise.all([
    listRecruitmentPlatformMetadata(),
    prisma.companyProfile.findUnique({
      where: { userId: params.userId },
      include: { recruitmentPlatforms: true },
    }),
  ]);
  if (!current) throw new Error('company profile not found');

  const metadataById = new Map(platformMetadata.map((platform) => [platform.id, platform]));
  const currentByPlatform = new Map(
    current.recruitmentPlatforms.map((config) => [config.platformId, config]),
  );

  const row = await prisma.$transaction(async (tx) => {
    for (const input of params.platformConfigs) {
      const metadata = metadataById.get(input.platformId);
      if (!metadata) {
        throw new Error(`recruitment platform is unavailable: ${input.platformId}`);
      }
      const existing = currentByPlatform.get(input.platformId);
      const passwordEncrypted = input.clearPassword
        ? null
        : input.password
          ? encryptPlatformPassword(input.password)
          : (existing?.passwordEncrypted ?? null);

      await tx.companyRecruitmentPlatform.upsert({
        where: {
          companyProfileId_platformId: {
            companyProfileId: current.id,
            platformId: input.platformId,
          },
        },
        create: {
          companyProfileId: current.id,
          platformId: input.platformId,
          baseUrl: input.baseUrl || metadata.defaultBaseUrl,
          username: input.username || null,
          passwordEncrypted,
          variables: toJsonRecord(input.variables),
        },
        update: {
          baseUrl: input.baseUrl || metadata.defaultBaseUrl,
          username: input.username || null,
          passwordEncrypted,
          variables: toJsonRecord(input.variables),
        },
      });
    }

    return tx.companyProfile.findUniqueOrThrow({
      where: { id: current.id },
      include: {
        locations: { orderBy: locationsOrderBy },
        recruitmentPlatforms: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  return mapProfile(row as CompanyProfileRow) as CompanyProfileDto;
}
