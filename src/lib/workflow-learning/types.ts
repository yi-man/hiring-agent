/**
 * SSE payloads for workflow-learning (see design spec §5.2).
 * All variants include runId + ISO timestamp for ordering and UI correlation.
 */

export type WorkflowBaseFields = {
  runId: string;
  timestamp: string;
};

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
  | (WorkflowBaseFields & { type: 'run_end' });

export function isWorkflowSseEvent(value: unknown): value is WorkflowSseEvent {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return typeof t === 'string';
}
