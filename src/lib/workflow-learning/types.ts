import { z } from 'zod';
import { workflowDslSchema, type WorkflowDsl } from '@/lib/workflow-learning/dsl';

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
  | (WorkflowBaseFields & {
      type: 'awaiting_login';
      sessionId: string;
      loginUrl: string;
      message: string;
    })
  | (WorkflowBaseFields & { type: 'login_verified'; sessionId: string })
  | (WorkflowBaseFields & { type: 'workflow_dsl'; workflow: WorkflowDsl })
  | (WorkflowBaseFields & {
      type: 'dsl_validation_result';
      ok: boolean;
      error?: string;
    })
  | (WorkflowBaseFields & {
      type: 'workflow_state_changed';
      state:
        | 'check_login'
        | 'login_required'
        | 'resume_after_login'
        | 'explore_target_page'
        | 'extract_result'
        | 'generate_dsl'
        | 'replay_dsl'
        | 'success'
        | 'failed';
      message?: string;
    })
  | (WorkflowBaseFields & {
      type: 'dsl_replay_step';
      stepId: string;
      stepType: string;
      status: 'running' | 'skipped' | 'success' | 'failed';
      message?: string;
      outputPreview?: string;
      error?: string;
    })
  | (WorkflowBaseFields & { type: 'error'; message: string })
  | (WorkflowBaseFields & { type: 'run_end' });

const baseFieldsSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.string().min(1),
});

const workflowSseEventSchema = z.discriminatedUnion('type', [
  baseFieldsSchema.extend({ type: z.literal('run_start') }),
  baseFieldsSchema.extend({
    type: z.literal('tool_call_start'),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    argsPreview: z.string(),
  }),
  baseFieldsSchema.extend({
    type: z.literal('tool_call_result'),
    toolCallId: z.string().min(1),
    ok: z.boolean(),
    resultPreview: z.string(),
    durationMs: z.number().optional(),
  }),
  baseFieldsSchema.extend({ type: z.literal('thought'), text: z.string() }),
  baseFieldsSchema.extend({ type: z.literal('assistant_delta'), text: z.string() }),
  baseFieldsSchema.extend({ type: z.literal('assistant_final'), text: z.string() }),
  baseFieldsSchema.extend({
    type: z.literal('awaiting_login'),
    sessionId: z.string().min(1),
    loginUrl: z.string().url(),
    message: z.string().min(1),
  }),
  baseFieldsSchema.extend({
    type: z.literal('login_verified'),
    sessionId: z.string().min(1),
  }),
  baseFieldsSchema.extend({
    type: z.literal('workflow_dsl'),
    workflow: workflowDslSchema,
  }),
  baseFieldsSchema.extend({
    type: z.literal('dsl_validation_result'),
    ok: z.boolean(),
    error: z.string().min(1).optional(),
  }),
  baseFieldsSchema.extend({
    type: z.literal('workflow_state_changed'),
    state: z.enum([
      'check_login',
      'login_required',
      'resume_after_login',
      'explore_target_page',
      'extract_result',
      'generate_dsl',
      'replay_dsl',
      'success',
      'failed',
    ]),
    message: z.string().optional(),
  }),
  baseFieldsSchema.extend({
    type: z.literal('dsl_replay_step'),
    stepId: z.string().min(1),
    stepType: z.string().min(1),
    status: z.enum(['running', 'skipped', 'success', 'failed']),
    message: z.string().optional(),
    outputPreview: z.string().optional(),
    error: z.string().optional(),
  }),
  baseFieldsSchema.extend({ type: z.literal('error'), message: z.string().min(1) }),
  baseFieldsSchema.extend({ type: z.literal('run_end') }),
]);

export function isWorkflowSseEvent(value: unknown): value is WorkflowSseEvent {
  return workflowSseEventSchema.safeParse(value).success;
}
