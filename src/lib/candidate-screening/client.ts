import type {
  CandidateScreeningDetailDto,
  CandidateScreeningResultDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunDto,
} from './repo';
import type {
  CandidateDecisionAction,
  CandidateInterviewStage,
  CandidateScreeningSource,
  CreateScreeningRunRequest,
  ExecuteActionsRequest,
  UpdateCandidateProgressRequest,
} from './types';

export type CandidateListFilters = {
  decisionAction?: CandidateDecisionAction;
  interviewStage?: CandidateInterviewStage;
  source?: CandidateScreeningSource;
  minScore?: number;
  limit?: number;
  offset?: number;
};

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined || value === '') {
    return;
  }
  params.set(key, String(value));
}

export async function createCandidateScreeningRun(
  jobDescriptionId: string,
  payload: Partial<CreateScreeningRunRequest>,
): Promise<CandidateScreeningRunDto> {
  const response = await fetch(`/api/jd/${jobDescriptionId}/candidate-screening/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ run?: CandidateScreeningRunDto }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '创建候选人筛选任务失败');
  }
  return data.run;
}

export async function fetchCandidateScreeningRuns(
  jobDescriptionId: string,
): Promise<CandidateScreeningRunDto[]> {
  const response = await fetch(`/api/jd/${jobDescriptionId}/candidate-screening/runs`);
  const data = await readJson<{ runs?: CandidateScreeningRunDto[] }>(response);
  if (!response.ok || !Array.isArray(data.runs)) {
    throw new Error(data.error || '加载候选人筛选任务失败');
  }
  return data.runs;
}

export async function fetchCandidateScreeningRun(runId: string): Promise<CandidateScreeningRunDto> {
  const response = await fetch(`/api/candidate-screening/runs/${runId}`);
  const data = await readJson<{ run?: CandidateScreeningRunDto }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '加载候选人筛选进度失败');
  }
  return data.run;
}

export async function executeCandidateScreeningActions(
  runId: string,
  payload: ExecuteActionsRequest,
): Promise<void> {
  const response = await fetch(`/api/candidate-screening/runs/${runId}/execute-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ ok?: boolean }>(response);
  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || '执行候选人动作失败');
  }
}

export async function fetchJdCandidates(
  jobDescriptionId: string,
  filters: CandidateListFilters = {},
): Promise<CandidateScreeningResultListItem[]> {
  const params = new URLSearchParams();
  appendSearchParam(params, 'interviewStage', filters.interviewStage);
  appendSearchParam(params, 'limit', filters.limit);
  appendSearchParam(params, 'offset', filters.offset);
  const query = params.toString();
  const response = await fetch(`/api/jd/${jobDescriptionId}/candidates${query ? `?${query}` : ''}`);
  const data = await readJson<{ candidates?: CandidateScreeningResultListItem[] }>(response);
  if (!response.ok || !Array.isArray(data.candidates)) {
    throw new Error(data.error || '加载候选人列表失败');
  }

  return data.candidates.filter((candidate) => {
    if (filters.decisionAction && candidate.decisionAction !== filters.decisionAction) return false;
    if (filters.source && candidate.source !== filters.source) return false;
    if (filters.minScore !== undefined && candidate.finalScore < filters.minScore) return false;
    return true;
  });
}

export async function fetchJdCandidateDetail(
  jobDescriptionId: string,
  candidateId: string,
): Promise<CandidateScreeningDetailDto> {
  const response = await fetch(`/api/jd/${jobDescriptionId}/candidates/${candidateId}`);
  const data = await readJson<{ candidate?: CandidateScreeningDetailDto }>(response);
  if (!response.ok || !data.candidate) {
    throw new Error(data.error || '加载候选人详情失败');
  }
  return data.candidate;
}

export async function updateJdCandidateProgress(
  jobDescriptionId: string,
  candidateId: string,
  payload: UpdateCandidateProgressRequest,
): Promise<CandidateScreeningResultDto> {
  const response = await fetch(`/api/jd/${jobDescriptionId}/candidates/${candidateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ candidate?: CandidateScreeningResultDto }>(response);
  if (!response.ok || !data.candidate) {
    throw new Error(data.error || '保存候选人进度失败');
  }
  return data.candidate;
}
