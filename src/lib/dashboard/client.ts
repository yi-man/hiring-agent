import type { DashboardOverviewDto } from './types';

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchDashboardOverview(query: string): Promise<DashboardOverviewDto> {
  const response = await fetch(`/api/dashboard${query ? `?${query}` : ''}`);
  const data = await readJson<Partial<DashboardOverviewDto>>(response);

  if (
    !response.ok ||
    !data.summary ||
    !Array.isArray(data.statusCounts) ||
    !Array.isArray(data.platforms) ||
    !Array.isArray(data.jobs) ||
    !Array.isArray(data.recentTasks) ||
    !data.filters
  ) {
    throw new Error(data.error || '加载工作台失败');
  }

  return data as DashboardOverviewDto;
}
