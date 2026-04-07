export type WorkflowStep = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  canBatch: boolean;
  successCondition?: string;
};

export type StoredWorkflow = {
  id: string;
  userId: string;
  name: string;
  goal: string;
  version: number;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunStepResult = {
  stepId: string;
  tool: string;
  ok: boolean;
  result?: string;
  error?: string;
  durationMs?: number;
};

export type WorkflowRunResult = {
  runId: string;
  workflowId: string;
  success: boolean;
  recovered: boolean;
  error?: string;
  steps: WorkflowRunStepResult[];
};
