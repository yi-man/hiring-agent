export const CHAT_PATTERN_IDS = [
  'basic_streaming_chat',
  'memory_persistence',
  'rag_over_uploaded_doc',
  'source_grounding',
  'tool_calling',
  'agent_trace_stream',
  'structured_output',
  'human_approval_gate',
  'error_recovery_retry',
] as const;

export type ChatPatternId = (typeof CHAT_PATTERN_IDS)[number];

export type ChatRunEvent =
  | { type: 'run_start'; runId: string; patternId: ChatPatternId; startedAt: string; seq: number }
  | { type: 'assistant_delta'; runId: string; text: string; seq: number }
  | { type: 'assistant_final'; runId: string; text: string; seq: number }
  | { type: 'reasoning_delta'; runId: string; text: string; seq: number }
  | {
      type: 'tool_call_start';
      runId: string;
      toolCallId: string;
      toolName: string;
      argsPreview: string;
      seq: number;
    }
  | {
      type: 'tool_call_result';
      runId: string;
      toolCallId: string;
      ok: boolean;
      resultPreview: string;
      durationMs?: number;
      seq: number;
    }
  | {
      type: 'approval_required';
      runId: string;
      approvalToken: string;
      message: string;
      seq: number;
    }
  | {
      type: 'approval_resolved';
      runId: string;
      approvalToken: string;
      approved: boolean;
      seq: number;
    }
  | {
      type: 'structured_output';
      runId: string;
      schemaName: string;
      payload: Record<string, unknown>;
      seq: number;
    }
  | {
      type: 'checkpoint_created';
      runId: string;
      checkpointId: string;
      label: string;
      seq: number;
    }
  | { type: 'queue_state'; runId: string; pending: number; seq: number }
  | { type: 'error'; runId: string; message: string; seq: number }
  | { type: 'run_end'; runId: string; seq: number };

type WithoutSeq<T> = T extends unknown ? Omit<T, 'seq'> : never;

export type ChatRunEventPayload = WithoutSeq<ChatRunEvent>;

export function isChatPatternId(value: string): value is ChatPatternId {
  return (CHAT_PATTERN_IDS as readonly string[]).includes(value);
}
