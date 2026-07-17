import type {
  CompanyWorkLocationInput,
  CompanyWorkLocationKind,
  CompanyRecruitmentPlatformInput,
  NormalizedCompanyWorkLocationInput,
  UpsertCompanyProfileParams,
} from './types';
import {
  DEFAULT_RECRUITMENT_PLATFORMS,
  normalizeRecruitmentPlatforms,
} from '@/lib/recruitment-platforms';
import { isRecruitmentPlatform } from '@/lib/recruitment-platforms';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanOptionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function isLocationKind(value: unknown): value is CompanyWorkLocationKind {
  return value === 'office' || value === 'remote';
}

function parseLocation(value: unknown): CompanyWorkLocationInput | null {
  if (!isRecord(value) || !isLocationKind(value.kind)) {
    return null;
  }

  if (value.kind === 'remote') {
    return {
      kind: 'remote',
      label: '远程',
      city: null,
      address: null,
    };
  }

  const label = cleanText(value.label);
  if (!label) {
    return null;
  }

  return {
    kind: 'office',
    label,
    city: cleanOptionalText(value.city),
    address: cleanOptionalText(value.address),
  };
}

function parseVariables(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const entries: Array<[string, string]> = [];
  for (const [key, item] of Object.entries(value)) {
    const cleanKey = key.trim();
    if (!cleanKey || typeof item !== 'string') return null;
    entries.push([cleanKey, item.trim()]);
  }
  return Object.fromEntries(entries);
}

function parsePlatformConfig(value: unknown): CompanyRecruitmentPlatformInput | null {
  if (!isRecord(value) || !isRecruitmentPlatform(value.platformId)) return null;
  const baseUrl = cleanText(value.baseUrl);
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const variables = parseVariables(value.variables);
  if (!variables) return null;
  const password = typeof value.password === 'string' ? value.password : undefined;
  return {
    platformId: value.platformId,
    baseUrl,
    username: cleanText(value.username),
    ...(password ? { password } : {}),
    ...(value.clearPassword === true ? { clearPassword: true } : {}),
    variables,
  };
}

export function normalizeCompanyWorkLocations(
  locations: CompanyWorkLocationInput[],
): NormalizedCompanyWorkLocationInput[] {
  const seen = new Set<string>();
  const normalized: CompanyWorkLocationInput[] = [];

  for (const location of locations) {
    const next =
      location.kind === 'remote'
        ? {
            kind: 'remote' as const,
            label: '远程',
            city: null,
            address: null,
          }
        : {
            kind: 'office' as const,
            label: location.label.trim(),
            city: location.city?.trim() || null,
            address: location.address?.trim() || null,
          };

    if (!next.label || seen.has(next.label)) {
      continue;
    }

    seen.add(next.label);
    normalized.push(next);
  }

  return normalized.map((location, sortOrder) => ({ ...location, sortOrder }));
}

export function parseCompanyProfilePayload(
  body: unknown,
): ValidationResult<Omit<UpsertCompanyProfileParams, 'userId'>> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const name = cleanText(body.name);
  if (!name) {
    return { ok: false, error: 'company name is required' };
  }

  const supportedPlatforms = normalizeRecruitmentPlatforms(
    body.supportedPlatforms,
    DEFAULT_RECRUITMENT_PLATFORMS,
  );
  if (body.supportedPlatforms !== undefined && supportedPlatforms.length === 0) {
    return { ok: false, error: 'at least one recruitment platform is required' };
  }
  const rawPlatformConfigs = body.platformConfigs;
  const platformConfigs = Array.isArray(rawPlatformConfigs)
    ? rawPlatformConfigs
        .map(parsePlatformConfig)
        .filter((item): item is CompanyRecruitmentPlatformInput => item !== null)
    : [];
  if (Array.isArray(rawPlatformConfigs) && platformConfigs.length !== rawPlatformConfigs.length) {
    return { ok: false, error: 'recruitment platform configuration is invalid' };
  }
  const configIds = new Set(platformConfigs.map((config) => config.platformId));
  if (configIds.size !== platformConfigs.length) {
    return { ok: false, error: 'recruitment platform configuration is duplicated' };
  }
  if (platformConfigs.some((config) => !supportedPlatforms.includes(config.platformId))) {
    return { ok: false, error: 'recruitment platform configuration is not enabled' };
  }

  if (!Array.isArray(body.locations) || body.locations.length === 0) {
    return { ok: false, error: 'at least one work location is required' };
  }

  const locations = body.locations
    .map((location) => parseLocation(location))
    .filter((location): location is CompanyWorkLocationInput => location !== null);
  const normalized = normalizeCompanyWorkLocations(locations).map((location) => ({
    kind: location.kind,
    label: location.label,
    city: location.city,
    address: location.address,
  }));

  if (normalized.length === 0) {
    return { ok: false, error: 'at least one work location is required' };
  }

  return {
    ok: true,
    value: {
      name,
      supportedPlatforms,
      ...(body.platformConfigs !== undefined ? { platformConfigs } : {}),
      locations: normalized,
    },
  };
}

export function parseCompanyRecruitmentPlatformsPayload(
  body: unknown,
  availablePlatforms: readonly CompanyRecruitmentPlatformInput['platformId'][],
): ValidationResult<CompanyRecruitmentPlatformInput[]> {
  if (!isRecord(body) || !Array.isArray(body.platformConfigs)) {
    return { ok: false, error: 'recruitment platform configuration is required' };
  }

  const platformConfigs = body.platformConfigs
    .map(parsePlatformConfig)
    .filter((item): item is CompanyRecruitmentPlatformInput => item !== null);
  if (platformConfigs.length !== body.platformConfigs.length) {
    return { ok: false, error: 'recruitment platform configuration is invalid' };
  }

  const configIds = new Set(platformConfigs.map((config) => config.platformId));
  if (configIds.size !== platformConfigs.length) {
    return { ok: false, error: 'recruitment platform configuration is duplicated' };
  }
  if (platformConfigs.length === 0) {
    return { ok: false, error: 'at least one recruitment platform configuration is required' };
  }
  const availableIds = new Set(availablePlatforms);
  if (platformConfigs.some((config) => !availableIds.has(config.platformId))) {
    return { ok: false, error: 'recruitment platform is unavailable' };
  }

  return { ok: true, value: platformConfigs };
}
