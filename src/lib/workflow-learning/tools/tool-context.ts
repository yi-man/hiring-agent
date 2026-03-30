import type { BrowserSessionManager } from '../browser-session-manager';
import type { WorkflowSseEvent } from '../types';

export interface ToolContext {
  sessionManager: BrowserSessionManager;
  userId: string;
  emitEvent: (event: WorkflowSseEvent) => void;
  runId: string;
}
