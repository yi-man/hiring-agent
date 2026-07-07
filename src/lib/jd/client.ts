import type {
  CreateJobDescriptionRequest,
  JDStatus,
  JobDescriptionDto,
  RegenerateJobDescriptionRequest,
  UpdateJobDescriptionRequest,
} from '@/types';
import type { PublishJobDescriptionSettings, PublishTaskResult } from '@/lib/jd-publishing/types';
import type { PublishTaskDto } from '@/lib/jd-publishing/types';

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchJobDescriptions(
  status: JDStatus | 'all' = 'all',
): Promise<JobDescriptionDto[]> {
  const params = new URLSearchParams();
  if (status !== 'all') {
    params.set('status', status);
  }
  const query = params.toString();
  const response = await fetch(`/api/jd${query ? `?${query}` : ''}`);
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

export type PublishJobDescriptionResponse = {
  jobDescription: JobDescriptionDto;
  task: PublishTaskResult;
};

export async function publishJobDescriptionResource(
  id: string,
  payload: PublishJobDescriptionSettings,
): Promise<PublishJobDescriptionResponse> {
  const response = await fetch(`/api/jd/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<Partial<PublishJobDescriptionResponse>>(response);
  if (!response.ok || !data.jobDescription || !data.task) {
    const error = new Error(data.error || '发布 JD 失败') as Error &
      Partial<PublishJobDescriptionResponse>;
    error.jobDescription = data.jobDescription;
    error.task = data.task;
    throw error;
  }
  return { jobDescription: data.jobDescription, task: data.task };
}

export async function fetchJobDescriptionPublishTasks(id: string): Promise<PublishTaskDto[]> {
  const response = await fetch(`/api/jd/${id}/publish`);
  const data = await readJson<{ tasks?: PublishTaskDto[] }>(response);
  if (!response.ok || !Array.isArray(data.tasks)) {
    throw new Error(data.error || '加载发布记录失败');
  }
  return data.tasks;
}
