export const RECRUITMENT_PLATFORM_IDS = ['boss', 'liepin', 'zhilian', 'boss-like'] as const;

export type RecruitmentPlatform = (typeof RECRUITMENT_PLATFORM_IDS)[number];

export const DEFAULT_RECRUITMENT_PLATFORMS: RecruitmentPlatform[] = ['boss-like'];

const platformIds = new Set<string>(RECRUITMENT_PLATFORM_IDS);

export function isRecruitmentPlatform(value: unknown): value is RecruitmentPlatform {
  return typeof value === 'string' && platformIds.has(value);
}

export function normalizeRecruitmentPlatforms(
  values: unknown,
  fallback: readonly RecruitmentPlatform[] = DEFAULT_RECRUITMENT_PLATFORMS,
): RecruitmentPlatform[] {
  if (!Array.isArray(values)) return [...fallback];
  const selected = new Set(
    values
      .map((value) => (typeof value === 'string' ? value.trim() : value))
      .filter(isRecruitmentPlatform),
  );
  return RECRUITMENT_PLATFORM_IDS.filter((platform) => selected.has(platform));
}

export function resolveRecruitmentPlatforms(
  value: { platform?: unknown; platforms?: unknown },
  defaults: readonly RecruitmentPlatform[] = DEFAULT_RECRUITMENT_PLATFORMS,
): RecruitmentPlatform[] {
  if (value.platforms !== undefined) return normalizeRecruitmentPlatforms(value.platforms, []);
  if (isRecruitmentPlatform(value.platform)) return [value.platform];
  return [...defaults];
}
