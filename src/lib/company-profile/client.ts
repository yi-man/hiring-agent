import type { CompanyProfileDto, CompanyWorkLocationInput } from './types';

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

export async function saveCompanyProfile(payload: {
  name: string;
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
