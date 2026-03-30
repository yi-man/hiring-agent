/**
 * SSE payloads for workflow-learning (see design spec §5.2 + §9.1 phase 1.5).
 * All variants include runId + ISO timestamp for ordering and UI correlation.
 */

export type WorkflowBaseFields = {
  runId: string;
  timestamp: string;
};

export interface BrowserSubStep {
  action: 'navigate' | 'snapshot' | 'click' | 'type' | 'close';
  params: Record<string, string>;
  description: string;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_user';

export interface TaskStep {
  id: string;
  description: string;
  type: 'browser_action' | 'analysis' | 'report';
  browserSubSteps?: BrowserSubStep[];
  onFailure: 'replan' | 'skip' | 'abort';
  status: StepStatus;
}

export interface TaskPlan {
  goal: string;
  steps: TaskStep[];
  fallbackStrategy: string;
}

export type WorkflowSseEvent =
  | (WorkflowBaseFields & { type: 'run_start' })
  | (WorkflowBaseFields & {
      type: 'tool_call_start';
      toolCallId: string;
      toolName: string;
      argsPreview: string;
    })
  | (WorkflowBaseFields & {
      type: 'tool_call_result';
      toolCallId: string;
      ok: boolean;
      resultPreview: string;
      durationMs?: number;
    })
  | (WorkflowBaseFields & { type: 'thought'; text: string })
  | (WorkflowBaseFields & { type: 'assistant_delta'; text: string })
  | (WorkflowBaseFields & { type: 'assistant_final'; text: string })
  | (WorkflowBaseFields & { type: 'error'; message: string })
  | (WorkflowBaseFields & { type: 'run_end' })
  | (WorkflowBaseFields & { type: 'plan'; plan: TaskPlan })
  | (WorkflowBaseFields & {
      type: 'plan_step_update';
      stepId: string;
      status: StepStatus;
      summary?: string;
    })
  | (WorkflowBaseFields & { type: 'plan_update'; plan: TaskPlan; reason: string })
  | (WorkflowBaseFields & { type: 'user_action_required'; reason: string })
  | (WorkflowBaseFields & { type: 'user_action_resolved' });

export function isWorkflowSseEvent(value: unknown): value is WorkflowSseEvent {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return typeof t === 'string';
}
