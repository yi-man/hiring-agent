import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';
import type { CandidateCommunicationRunDto, CandidateCommunicationRunMode } from './repo';

export type SyncUnreadCandidateConversationsRequest = {
  platform: CandidateScreeningPlatform;
  maxPasses?: number;
};

export type StartCandidateCommunicationRunRequest =
  | {
      mode: Extract<CandidateCommunicationRunMode, 'batch'>;
      platform?: CandidateScreeningPlatform;
      platforms?: CandidateScreeningPlatform[];
      jobDescriptionId?: string;
      maxPasses?: number;
    }
  | {
      mode: Extract<CandidateCommunicationRunMode, 'single'>;
      platform: CandidateScreeningPlatform;
      jobDescriptionId: string;
      candidateId: string;
      sourceScreeningRunId?: string;
    };

export type SyncUnreadCandidateConversationsResult = {
  status: 'success';
  stoppedReason: 'no_unread_messages';
  processed: number;
  failed: number;
  passes: number;
};

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

function isSyncResult(value: unknown): value is SyncUnreadCandidateConversationsResult {
  const data = value as Partial<SyncUnreadCandidateConversationsResult>;
  return (
    data.status === 'success' &&
    data.stoppedReason === 'no_unread_messages' &&
    typeof data.processed === 'number' &&
    typeof data.failed === 'number' &&
    typeof data.passes === 'number'
  );
}

function isCommunicationRun(value: unknown): value is CandidateCommunicationRunDto {
  const data = value as Partial<CandidateCommunicationRunDto>;
  return (
    typeof data.id === 'string' &&
    (data.mode === 'batch' || data.mode === 'single') &&
    (data.status === 'running' || data.status === 'success' || data.status === 'failed')
  );
}

export async function syncUnreadCandidateConversations(
  payload: SyncUnreadCandidateConversationsRequest,
): Promise<SyncUnreadCandidateConversationsResult> {
  const response = await fetch('/api/candidate-conversations/sync-unread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<Partial<SyncUnreadCandidateConversationsResult>>(response);
  if (!response.ok || !isSyncResult(data)) {
    throw new Error(data.error || '同步候选人沟通失败');
  }
  return data;
}

export async function startCandidateCommunicationRun(
  payload: StartCandidateCommunicationRunRequest,
): Promise<CandidateCommunicationRunDto> {
  const response = await fetch('/api/candidate-conversations/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ run?: unknown }>(response);
  if (!response.ok || !isCommunicationRun(data.run)) {
    throw new Error(data.error || '启动候选人沟通失败');
  }
  return data.run;
}

export async function startCandidateCommunicationRuns(
  payload: Extract<StartCandidateCommunicationRunRequest, { mode: 'batch' }> & {
    platforms: CandidateScreeningPlatform[];
  },
): Promise<CandidateCommunicationRunDto[]> {
  const response = await fetch('/api/candidate-conversations/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ runs?: unknown[] }>(response);
  const runs = Array.isArray(data.runs) ? data.runs.filter(isCommunicationRun) : [];
  if (!response.ok || runs.length === 0) {
    throw new Error(data.error || '启动候选人沟通失败');
  }
  return runs;
}

export async function fetchCandidateCommunicationRun(
  runId: string,
): Promise<CandidateCommunicationRunDto> {
  const response = await fetch(`/api/candidate-conversations/runs/${runId}`);
  const data = await readJson<{ run?: unknown }>(response);
  if (!response.ok || !isCommunicationRun(data.run)) {
    throw new Error(data.error || '加载候选人沟通记录失败');
  }
  return data.run;
}
