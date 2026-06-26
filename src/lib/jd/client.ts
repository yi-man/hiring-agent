import type {
  CreateJobDescriptionRequest,
  JobDescriptionDto,
  RegenerateJobDescriptionRequest,
  UpdateJobDescriptionRequest,
} from '@/types';

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchJobDescriptions(): Promise<JobDescriptionDto[]> {
  const response = await fetch('/api/jd');
  const data = await readJson<{ jobDescriptions?: JobDescriptionDto[] }>(response);
  if (!response.ok || !Array.isArray(data.jobDescriptions)) {
    throw new Error(data.error || '加载 JD 列表失败');
  }
  return data.jobDescriptions;
}

export async function createJobDescriptionFromInput(
  payload: CreateJobDescriptionRequest,
): Promise<JobDescriptionDto> {
  const response = await fetch('/api/jd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ jobDescription?: JobDescriptionDto }>(response);
  if (!response.ok || !data.jobDescription) {
    throw new Error(data.error || '创建 JD 失败');
  }
  return data.jobDescription;
}

export async function fetchJobDescription(id: string): Promise<JobDescriptionDto> {
  const response = await fetch(`/api/jd/${id}`);
  const data = await readJson<{ jobDescription?: JobDescriptionDto }>(response);
  if (!response.ok || !data.jobDescription) {
    throw new Error(data.error || '加载 JD 失败');
  }
  return data.jobDescription;
}

export async function updateJobDescriptionResource(
  id: string,
  payload: UpdateJobDescriptionRequest,
): Promise<JobDescriptionDto> {
  const response = await fetch(`/api/jd/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ jobDescription?: JobDescriptionDto }>(response);
  if (!response.ok || !data.jobDescription) {
    throw new Error(data.error || '保存 JD 失败');
  }
  return data.jobDescription;
}

export async function regenerateJobDescription(
  id: string,
  payload: RegenerateJobDescriptionRequest,
): Promise<JobDescriptionDto> {
  const response = await fetch(`/api/jd/${id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ jobDescription?: JobDescriptionDto }>(response);
  if (!response.ok || !data.jobDescription) {
    throw new Error(data.error || '重新生成 JD 失败');
  }
  return data.jobDescription;
}
