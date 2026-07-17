import type { JobDescriptionDto } from '@/types';
import type { BossLikeJobPayload, PublishJobDescriptionSettings, PublishPlatform } from './types';
import { isRecruitmentPlatform } from '@/lib/recruitment-platforms';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function section(title: string, items: string[]): string {
  const lines = items.map((item) => item.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  return [title, ...lines.map((item) => `- ${item}`)].join('\n');
}

function defaultKeywords(jobDescription: JobDescriptionDto): string[] {
  return [jobDescription.position, jobDescription.department]
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parsePublishJobDescriptionPayload(
  body: unknown,
): ValidationResult<PublishJobDescriptionSettings> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const platform = cleanText(body.platform);
  if (!isRecruitmentPlatform(platform)) {
    return { ok: false, error: 'platform is unsupported' };
  }

  const company = cleanText(body.company);
  if (!company) return { ok: false, error: 'company is required' };

  const salary = cleanText(body.salary);
  if (!salary) return { ok: false, error: 'salary is required' };

  const location = cleanText(body.location);
  if (!location) return { ok: false, error: 'location is required' };

  return {
    ok: true,
    value: {
      platform: platform as PublishPlatform,
      company,
      salary,
      location,
      keywords: cleanStringList(body.keywords),
    },
  };
}

export function buildBossLikeJobPayload(
  jobDescription: JobDescriptionDto,
  settings: PublishJobDescriptionSettings,
): BossLikeJobPayload {
  const content = jobDescription.content;
  const description = [
    content.summary.trim(),
    section('岗位职责', content.responsibilities),
    section('任职要求', content.requirements),
    section('加分项', content.bonus),
    section('岗位亮点', content.highlights),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    title: content.title.trim() || jobDescription.position,
    company: settings.company,
    salary: settings.salary,
    location: settings.location,
    description,
    keywords: settings.keywords.length > 0 ? settings.keywords : defaultKeywords(jobDescription),
  };
}
