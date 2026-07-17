import type {
  CandidateDecisionResultDto,
  CandidateInterviewFeedbackDto,
  CandidateInterviewRecordDto,
  CandidateResumeLibraryItemDto,
  CandidateScreeningDetailDto,
  CandidateScreeningRunEventDto,
  CandidateScreeningResultDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunDto,
  CandidateTrackingOverviewDto,
} from './repo';
import type {
  CandidateDecisionAction,
  CandidateInterviewStage,
  CandidateScreeningPlatform,
  CandidateScreeningSource,
  CreateScreeningRunRequest,
  ExecuteActionsRequest,
  UpdateCandidateProgressRequest,
  UpsertCandidateInterviewFeedbackRequest,
} from './types';

export type CandidateListFilters = {
  decisionAction?: CandidateDecisionAction;
  interviewStage?: CandidateInterviewStage;
  source?: CandidateScreeningSource;
  minScore?: number;
  runId?: string;
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

export async function createCandidateScreeningRuns(
  jobDescriptionId: string,
  payload: Omit<Partial<CreateScreeningRunRequest>, 'platform'> & {
    platforms: CandidateScreeningPlatform[];
  },
): Promise<CandidateScreeningRunDto[]> {
  const response = await fetch(`/api/jd/${jobDescriptionId}/candidate-screening/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ runs?: CandidateScreeningRunDto[] }>(response);
  if (!response.ok || !Array.isArray(data.runs) || data.runs.length === 0) {
    throw new Error(data.error || '创建候选人筛选任务失败');
  }
  return data.runs;
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

export async function fetchCandidateScreeningRunWithEvents(runId: string): Promise<{
  run: CandidateScreeningRunDto;
  events: CandidateScreeningRunEventDto[];
}> {
  const response = await fetch(`/api/candidate-screening/runs/${runId}`);
  const data = await readJson<{
    run?: CandidateScreeningRunDto;
    events?: CandidateScreeningRunEventDto[];
  }>(response);
  if (!response.ok || !data.run) {
    throw new Error(data.error || '加载候选人筛选进度失败');
  }
  return {
    run: data.run,
    events: Array.isArray(data.events) ? data.events : [],
  };
}

export async function fetchCandidateTrackingOverview(
  limit = 200,
): Promise<CandidateTrackingOverviewDto> {
  const params = new URLSearchParams();
  appendSearchParam(params, 'limit', limit);
  const response = await fetch(`/api/candidate-screening/tracking?${params.toString()}`);
  const data = await readJson<Partial<CandidateTrackingOverviewDto>>(response);
  if (!response.ok || !Array.isArray(data.jobs) || !Array.isArray(data.candidates)) {
    throw new Error(data.error || '加载候选人跟踪失败');
  }
  return {
    jobs: data.jobs,
    candidates: data.candidates,
  };
}

export async function fetchCandidateResumeLibrary(
  limit = 200,
): Promise<CandidateResumeLibraryItemDto[]> {
  const params = new URLSearchParams();
  appendSearchParam(params, 'limit', limit);
  const response = await fetch(`/api/resumes?${params.toString()}`);
  const data = await readJson<{ resumes?: CandidateResumeLibraryItemDto[] }>(response);
  if (!response.ok || !Array.isArray(data.resumes)) {
    throw new Error(data.error || '加载简历列表失败');
  }
  return data.resumes;
}

export async function fetchCandidateInterviewRecords(
  limit = 200,
): Promise<CandidateInterviewRecordDto[]> {
  const params = new URLSearchParams();
  appendSearchParam(params, 'limit', limit);
  const response = await fetch(`/api/interviews?${params.toString()}`);
  const data = await readJson<{ interviews?: CandidateInterviewRecordDto[] }>(response);
  if (!response.ok || !Array.isArray(data.interviews)) {
    throw new Error(data.error || '加载面试记录失败');
  }
  return data.interviews;
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
  appendSearchParam(params, 'minScore', filters.minScore);
  appendSearchParam(params, 'runId', filters.runId);
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

export async function fetchCandidateInterviewFeedbacks(
  jobDescriptionId: string,
  candidateId: string,
): Promise<CandidateInterviewFeedbackDto[]> {
  const response = await fetch(
    `/api/jd/${jobDescriptionId}/candidates/${candidateId}/interview-feedbacks`,
  );
  const data = await readJson<{ feedbacks?: CandidateInterviewFeedbackDto[] }>(response);
  if (!response.ok || !Array.isArray(data.feedbacks)) {
    throw new Error(data.error || '加载面试反馈失败');
  }
  return data.feedbacks;
}

export async function saveCandidateInterviewFeedback(
  jobDescriptionId: string,
  candidateId: string,
  payload: UpsertCandidateInterviewFeedbackRequest,
): Promise<CandidateInterviewFeedbackDto> {
  const response = await fetch(
    `/api/jd/${jobDescriptionId}/candidates/${candidateId}/interview-feedbacks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const data = await readJson<{ feedback?: CandidateInterviewFeedbackDto }>(response);
  if (!response.ok || !data.feedback) {
    throw new Error(data.error || '保存面试反馈失败');
  }
  return data.feedback;
}

export async function evaluateJdCandidateDecision(
  jobDescriptionId: string,
  candidateId: string,
): Promise<CandidateDecisionResultDto> {
  const response = await fetch('/api/decision/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_description_id: jobDescriptionId,
      candidate_id: candidateId,
    }),
  });
  const data = await readJson<{ decision?: CandidateDecisionResultDto }>(response);
  if (!response.ok || !data.decision) {
    throw new Error(data.error || '生成录用建议失败');
  }
  return data.decision;
}
