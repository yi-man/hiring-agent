import type {
  CreateJobDescriptionRequest,
  JDStatus,
  JobDescriptionDto,
  RegenerateJobDescriptionRequest,
  UpdateJobDescriptionRequest,
} from '@/types';
import type { PublishJobDescriptionSettings, PublishTaskResult } from '@/lib/jd-publishing/types';
import type { PublishTaskDto } from '@/lib/jd-publishing/types';
import type { JobDescriptionContextDto } from '@/lib/jd/context';
import type {
  JobDescriptionCreateRunDto,
  JobDescriptionCreateRunEventDto,
} from './create-run-repo';
import type {
  JobDescriptionPublishRunDto,
  JobDescriptionPublishRunEventDto,
} from '@/lib/jd-publishing/publish-run-repo';

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

export async function startJobDescriptionCreateRun(
  payload: CreateJobDescriptionRequest,
): Promise<JobDescriptionCreateRunDto> {
  const response = await fetch('/api/jd/create-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ run?: JobDescriptionCreateRunDto }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '创建 JD 生成任务失败');
  }
  return data.run;
}

export async function fetchJobDescriptionCreateRuns(
  options: {
    jobDescriptionId?: string;
    limit?: number;
  } = {},
): Promise<JobDescriptionCreateRunDto[]> {
  const params = new URLSearchParams();
  if (options.jobDescriptionId) {
    params.set('jobDescriptionId', options.jobDescriptionId);
  }
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  const query = params.toString();
  const response = await fetch(`/api/jd/create-runs${query ? `?${query}` : ''}`);
  const data = await readJson<{ runs?: JobDescriptionCreateRunDto[] }>(response);
  if (!response.ok || !Array.isArray(data.runs)) {
    throw new Error(data.error || '加载 JD 创建任务失败');
  }
  return data.runs;
}

export async function fetchJobDescriptionCreateRunWithEvents(runId: string): Promise<{
  run: JobDescriptionCreateRunDto;
  events: JobDescriptionCreateRunEventDto[];
}> {
  const response = await fetch(`/api/jd/create-runs/${runId}`);
  const data = await readJson<{
    run?: JobDescriptionCreateRunDto;
    events?: JobDescriptionCreateRunEventDto[];
  }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '加载 JD 创建进度失败');
  }
  return {
    run: data.run,
    events: Array.isArray(data.events) ? data.events : [],
  };
}

export async function fetchJobDescription(id: string): Promise<JobDescriptionDto> {
  const response = await fetch(`/api/jd/${id}`);
  const data = await readJson<{ jobDescription?: JobDescriptionDto }>(response);
  if (!response.ok || !data.jobDescription) {
    throw new Error(data.error || '加载 JD 失败');
  }
  return data.jobDescription;
}

export async function fetchJobDescriptionContext(id: string): Promise<JobDescriptionContextDto> {
  const response = await fetch(`/api/jd/${id}/context`);
  const data = await readJson<Partial<JobDescriptionContextDto>>(response);
  if (!response.ok || !data.jobDescription || !data.context) {
    throw new Error(data.error || '加载 JD 上下文失败');
  }
  return {
    jobDescription: data.jobDescription,
    context: data.context,
  };
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

export async function startJobDescriptionPublishRun(
  id: string,
  payload: PublishJobDescriptionSettings,
): Promise<JobDescriptionPublishRunDto> {
  const response = await fetch('/api/jd/publish-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, id }),
  });
  const data = await readJson<{ run?: JobDescriptionPublishRunDto }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '创建发布任务失败');
  }
  return data.run;
}

export async function fetchJobDescriptionPublishRunWithEvents(runId: string): Promise<{
  run: JobDescriptionPublishRunDto;
  events: JobDescriptionPublishRunEventDto[];
}> {
  const response = await fetch(`/api/jd/publish-runs/${runId}`);
  const data = await readJson<{
    run?: JobDescriptionPublishRunDto;
    events?: JobDescriptionPublishRunEventDto[];
  }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '加载发布进度失败');
  }
  return {
    run: data.run,
    events: Array.isArray(data.events) ? data.events : [],
  };
}
