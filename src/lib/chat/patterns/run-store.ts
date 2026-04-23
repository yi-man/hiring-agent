import type { ChatPatternId, ChatRunEvent } from './types';

type RunStatus = 'running' | 'paused_for_approval' | 'completed' | 'failed';

interface RunRecord {
  runId: string;
  conversationId: string;
  patternId: ChatPatternId;
  status: RunStatus;
  events: ChatRunEvent[];
  createdAt: number;
  updatedAt: number;
  pendingApprovalToken?: string;
}

const globalStore = globalThis as typeof globalThis & {
  __chatPatternRunStore?: Map<string, RunRecord>;
};

const runs = globalStore.__chatPatternRunStore ?? new Map<string, RunRecord>();
globalStore.__chatPatternRunStore = runs;

export function getRun(runId: string): RunRecord | undefined {
  return runs.get(runId);
}

export function upsertRun(run: RunRecord): RunRecord {
  runs.set(run.runId, run);
  return run;
}

export function appendRunEvent(runId: string, event: ChatRunEvent): RunRecord | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  run.events.push(event);
  run.updatedAt = Date.now();
  runs.set(runId, run);
  return run;
}

export function createRun(params: {
  runId: string;
  conversationId: string;
  patternId: ChatPatternId;
}): RunRecord {
  const now = Date.now();
  const run: RunRecord = {
    ...params,
    status: 'running',
    events: [],
    createdAt: now,
    updatedAt: now,
  };
  runs.set(params.runId, run);
  return run;
}

export function markRunStatus(runId: string, status: RunStatus): RunRecord | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  run.status = status;
  run.updatedAt = Date.now();
  runs.set(runId, run);
  return run;
}

export function setRunApprovalToken(runId: string, token?: string): RunRecord | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  run.pendingApprovalToken = token;
  run.updatedAt = Date.now();
  runs.set(runId, run);
  return run;
}
