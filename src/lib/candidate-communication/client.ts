import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

export type SyncUnreadCandidateConversationsRequest = {
  platform: CandidateScreeningPlatform;
  jobDescriptionId?: string;
  maxPasses?: number;
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
