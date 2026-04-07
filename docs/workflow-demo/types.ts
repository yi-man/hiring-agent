// ─────────────────────────────────────────────
// 核心数据结构
// ─────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  /** true = 可与下一步打包发给插件，无需等后端确认 */
  canBatch: boolean;
  /** 软错误判断：result 需满足的条件描述（LLM 用来检测） */
  successCondition?: string;
}

export interface WorkflowVersion {
  version: number;
  steps: WorkflowStep[];
  reason: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  goal: string;
  version: number;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
  history: WorkflowVersion[];
}

// ─────────────────────────────────────────────
// 执行时数据结构
// ─────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: string;
  error?: string;
}

export interface CompletedStep {
  step: WorkflowStep;
  result: StepResult;
}

export type RunnerState =
  | 'IDLE'
  | 'RUNNING'
  | 'RECOVERING'
  | 'PROMPTING_UPDATE'
  | 'UPDATING'
  | 'DONE'
  | 'FAILED';

// ─────────────────────────────────────────────
// 插件通信消息格式
// ─────────────────────────────────────────────

export interface BridgeMessage {
  type: 'exec_batch' | 'exec_single' | 'result' | 'screenshot_request' | 'screenshot_response';
  requestId: string;
  steps?: WorkflowStep[];
  step?: WorkflowStep;
  results?: StepResult[];
  result?: StepResult;
  screenshot?: string; // base64
}
