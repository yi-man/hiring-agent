import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';
import type {
  CompanyProfileDto,
  CompanyRecruitmentPlatformInput,
  CompanyWorkLocationInput,
} from './types';
import type { RecruitmentPlatformMetadataDto } from '@/lib/recruitment-platform-config';

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchCompanyProfile(): Promise<CompanyProfileDto | null> {
  const response = await fetch('/api/company-profile');
  const data = await readJson<{ profile?: CompanyProfileDto | null }>(response);
  if (!response.ok) {
    throw new Error(data.error || '加载公司信息失败');
  }
  return data.profile ?? null;
}

export async function fetchCompanySettings(): Promise<{
  profile: CompanyProfileDto | null;
  platforms: RecruitmentPlatformMetadataDto[];
}> {
  const response = await fetch('/api/company-profile');
  const data = await readJson<{
    profile?: CompanyProfileDto | null;
    platforms?: RecruitmentPlatformMetadataDto[];
  }>(response);
  if (!response.ok) throw new Error(data.error || '加载公司信息失败');
  return { profile: data.profile ?? null, platforms: data.platforms ?? [] };
}

export async function saveCompanyProfile(payload: {
  name: string;
  supportedPlatforms: RecruitmentPlatform[];
  platformConfigs?: CompanyRecruitmentPlatformInput[];
  locations: CompanyWorkLocationInput[];
}): Promise<CompanyProfileDto> {
  const response = await fetch('/api/company-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ profile?: CompanyProfileDto }>(response);
  if (!response.ok || !data.profile) {
    throw new Error(data.error || '保存公司信息失败');
  }
  return data.profile;
}

export async function saveCompanyRecruitmentPlatforms(
  platformConfigs: CompanyRecruitmentPlatformInput[],
): Promise<CompanyProfileDto> {
  const response = await fetch('/api/company-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platformConfigs }),
  });
  const data = await readJson<{ profile?: CompanyProfileDto }>(response);
  if (!response.ok || !data.profile) {
    throw new Error(data.error || '保存招聘平台连接失败');
  }
  return data.profile;
}
