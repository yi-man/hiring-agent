import {
  DEFAULT_RECRUITMENT_PLATFORMS,
  RECRUITMENT_PLATFORM_IDS,
  normalizeRecruitmentPlatforms,
  resolveRecruitmentPlatforms,
} from './recruitment-platforms';

describe('recruitment platforms', () => {
  it('keeps the supported platform ids as a strict runtime allowlist', () => {
    expect(RECRUITMENT_PLATFORM_IDS).toEqual(['boss', 'liepin', 'zhilian', 'boss-like']);
  });

  it('normalizes ids in registry order and keeps the compatibility default', () => {
    expect(normalizeRecruitmentPlatforms(['liepin', 'boss', 'liepin', 'unknown'])).toEqual([
      'boss',
      'liepin',
    ]);
    expect(normalizeRecruitmentPlatforms(undefined)).toEqual(DEFAULT_RECRUITMENT_PLATFORMS);
  });

  it('resolves task overrides before company defaults', () => {
    expect(resolveRecruitmentPlatforms({ platforms: ['zhilian', 'boss'] }, ['liepin'])).toEqual([
      'boss',
      'zhilian',
    ]);
    expect(resolveRecruitmentPlatforms({}, ['liepin'])).toEqual(['liepin']);
  });
});
