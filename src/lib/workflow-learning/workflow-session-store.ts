export type BossWorkflowTask = 'boss_open_home' | 'boss_read_first_message';

export type WorkflowTraceEntry = {
  step: string;
  result?: unknown;
  error?: string;
};

export type WorkflowSessionRecord = {
  pendingTask?: BossWorkflowTask;
  lastSuccessfulTask?: BossWorkflowTask;
  lastSuccessfulTrace: WorkflowTraceEntry[];
  outputs: Record<string, string>;
  loginStatus: 'unknown' | 'logged_in' | 'logged_out';
};

export type WorkflowSessionSnapshot = Readonly<
  Omit<WorkflowSessionRecord, 'lastSuccessfulTrace' | 'outputs'>
> & {
  readonly lastSuccessfulTrace: readonly Readonly<WorkflowTraceEntry>[];
  readonly outputs: Readonly<Record<string, string>>;
};

export class WorkflowSessionStore {
  private readonly records = new Map<string, WorkflowSessionRecord>();

  get(sessionId: string): WorkflowSessionSnapshot {
    return this.toSnapshot(this.getOrCreateMutable(sessionId));
  }

  setPendingTask(sessionId: string, task: BossWorkflowTask): void {
    const record = this.getOrCreateMutable(sessionId);
    record.pendingTask = task;
  }

  setLoginStatus(sessionId: string, status: WorkflowSessionRecord['loginStatus']): void {
    this.getOrCreateMutable(sessionId).loginStatus = status;
  }

  recordSuccess(
    sessionId: string,
    input: {
      task: BossWorkflowTask;
      trace: WorkflowTraceEntry[];
      outputs?: Record<string, string>;
    },
  ): void {
    const record = this.getOrCreateMutable(sessionId);
    record.pendingTask = undefined;
    record.lastSuccessfulTask = input.task;
    record.lastSuccessfulTrace = input.trace.map(cloneTraceEntry);
    record.outputs = { ...(input.outputs ?? {}) };
    record.loginStatus = 'logged_in';
  }

  private getOrCreateMutable(sessionId: string): WorkflowSessionRecord {
    const existing = this.records.get(sessionId);
    if (existing) return existing;
    const created: WorkflowSessionRecord = {
      lastSuccessfulTrace: [],
      outputs: {},
      loginStatus: 'unknown',
    };
    this.records.set(sessionId, created);
    return created;
  }

  private toSnapshot(record: WorkflowSessionRecord): WorkflowSessionSnapshot {
    return {
      pendingTask: record.pendingTask,
      lastSuccessfulTask: record.lastSuccessfulTask,
      lastSuccessfulTrace: record.lastSuccessfulTrace.map(cloneTraceEntry),
      outputs: { ...record.outputs },
      loginStatus: record.loginStatus,
    };
  }
}

export const workflowSessionStore = new WorkflowSessionStore();

function cloneTraceEntry(entry: WorkflowTraceEntry): WorkflowTraceEntry {
  return {
    ...entry,
    result: cloneUnknown(entry.result),
  };
}

function cloneUnknown<T>(value: T): T {
  if (value === undefined) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
