import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptPlatformPassword } from '@/lib/platform-credentials';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';

export type RecruitmentPlatformMetadataDto = {
  id: RecruitmentPlatform;
  label: string;
  shortLabel: string;
  description: string;
  kind: 'production' | 'local';
  defaultBaseUrl: string;
  defaultVariables: Record<string, string>;
};

export type CompanyRecruitmentPlatformConfigDto = {
  id: string;
  platformId: RecruitmentPlatform;
  baseUrl: string;
  username: string;
  hasPassword: boolean;
  variables: Record<string, string>;
};

export type RecruitmentPlatformRuntimeConfig = {
  platform: RecruitmentPlatform;
  baseUrl: string;
  username: string;
  password: string;
  variables: Record<string, string>;
  siteFingerprint: string;
  siteTemplatePlatform: RecruitmentPlatform;
};

type CompanyRecruitmentPlatformRow = {
  platformId: string;
  baseUrl: string;
  username: string | null;
  passwordEncrypted: string | null;
  variables: unknown;
};

type PlatformRow = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  kind: string;
  defaultBaseUrl: string;
  defaultVariables: unknown;
};

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === 'string' ? [[key, item.trim()]] : [],
    ),
  );
}

function mapPlatform(row: PlatformRow): RecruitmentPlatformMetadataDto {
  return {
    id: row.id as RecruitmentPlatform,
    label: row.label,
    shortLabel: row.shortLabel,
    description: row.description,
    kind: row.kind === 'local' ? 'local' : 'production',
    defaultBaseUrl: row.defaultBaseUrl,
    defaultVariables: stringRecord(row.defaultVariables),
  };
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('platform base URL must use http or https');
  }
  return url.origin;
}

export function createSiteFingerprint(baseUrl: string, variables: Record<string, string>): string {
  const paths = Object.fromEntries(
    Object.entries(variables)
      .filter(([key]) => key.endsWith('Path'))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash('sha256')
    .update(JSON.stringify({ origin: normalizedOrigin(baseUrl), paths }))
    .digest('hex')
    .slice(0, 24);
}

export async function listRecruitmentPlatformMetadata(): Promise<RecruitmentPlatformMetadataDto[]> {
  const rows = await prisma.recruitmentPlatform.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => mapPlatform(row));
}

function resolveRuntimeConfig(params: {
  platform: RecruitmentPlatform;
  platforms: RecruitmentPlatformMetadataDto[];
  companyConfigs: CompanyRecruitmentPlatformRow[];
}): RecruitmentPlatformRuntimeConfig {
  const platform = params.platforms.find((item) => item.id === params.platform);
  if (!platform) throw new Error(`recruitment platform is not configured: ${params.platform}`);
  const companyConfig = params.companyConfigs.find((item) => item.platformId === params.platform);
  const baseUrl = companyConfig?.baseUrl?.trim() || platform.defaultBaseUrl;
  const origin = normalizedOrigin(baseUrl);
  const siteTemplate =
    params.platforms.find((item) => normalizedOrigin(item.defaultBaseUrl) === origin) ?? platform;
  const variables = {
    ...siteTemplate.defaultVariables,
    ...stringRecord(companyConfig?.variables),
  };
  const password = companyConfig?.passwordEncrypted
    ? decryptPlatformPassword(companyConfig.passwordEncrypted)
    : '';
  return {
    platform: params.platform,
    baseUrl: origin,
    username: companyConfig?.username?.trim() || '',
    password,
    variables,
    siteFingerprint: createSiteFingerprint(origin, variables),
    siteTemplatePlatform: siteTemplate.id,
  };
}

export async function resolveRecruitmentPlatformRuntimeConfig(params: {
  userId: string;
  platform: RecruitmentPlatform;
}): Promise<RecruitmentPlatformRuntimeConfig> {
  const [platforms, profile] = await Promise.all([
    listRecruitmentPlatformMetadata(),
    prisma.companyProfile.findUnique({
      where: { userId: params.userId },
      include: { recruitmentPlatforms: true },
    }),
  ]);
  const companyConfigs = (profile?.recruitmentPlatforms ?? []) as CompanyRecruitmentPlatformRow[];
  return resolveRuntimeConfig({
    platform: params.platform,
    platforms,
    companyConfigs,
  });
}

export function toJsonRecord(value: Record<string, string>): Prisma.InputJsonValue {
  return value;
}
