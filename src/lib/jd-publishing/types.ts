import type { BrowserAction, BrowserStepCheck, BrowserStepResult } from '@/lib/browser/types';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';

export const BROWSER_WORKFLOW_DSL_VERSION = 'browser-v2' as const;

export type {
  BrowserCommand,
  BrowserCommandAction,
  BrowserCommandContext,
  BrowserCommandResult,
  BrowserCommandTransport,
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserStepResult,
  BrowserStepTargetKey,
  BrowserTargetInput,
  DomCandidate,
  LocatorMatchReport,
  StructuredDomSnapshot,
  TargetDescriptor,
} from '@/lib/browser/types';

export type PublishPlatform = RecruitmentPlatform;

export type PublishJobDescriptionSettings = {
  platform: PublishPlatform;
  company: string;
  salary: string;
  location: string;
  keywords: string[];
};

export type BossLikeJobPayload = {
  title: string;
  company: string;
  salary: string;
  location: string;
  description: string;
  keywords: string[];
};

export type BrowserWorkflowAction = BrowserAction | 'observe';

export type LegacyScreeningWorkflowAction =
  | 'ensure_login'
  | 'search_candidates'
  | 'enrich_candidate'
  | 'chat_candidate'
  | 'collect_candidate';

export type ScreeningWorkflowAction = LegacyScreeningWorkflowAction;

export type PublishSkillAction = BrowserWorkflowAction | LegacyScreeningWorkflowAction;

export type PublishSkillMeta = Record<string, unknown> & {
  dsl_version?: typeof BROWSER_WORKFLOW_DSL_VERSION;
  success_rate?: number;
  usage_count?: number;
  created_from?: 'explore' | 'agent';
  repaired_from_skill_id?: string;
  repaired_from_version?: number;
  failed_step_id?: string;
  repair_reason?: string;
  repair_strategy?: 'deterministic' | 'llm';
  repair_agent_prompt_id?: string;
  repair_agent_prompt_version?: string;
  repair_agent_provider?: string;
  repair_agent_model?: string;
};

export type PublishStepOnFail = {
  type: 'abort' | 'fallback_agent';
  reason: string;
  repairSteps?: PublishStep[];
};

export type PublishStepCheck = BrowserStepCheck;

export type PublishActionStep = {
  id: string;
  type: 'action';
  action: PublishSkillAction;
  params: Record<string, unknown>;
  next: string;
  onFail?: PublishStepOnFail;
};

export type PublishConditionStep = {
  id: string;
  type: 'condition';
  check: PublishStepCheck;
  ifTrue?: { next: string };
  ifFalse?: { next: string };
  onFail?: PublishStepOnFail;
};

export type PublishEndStep = {
  id: string;
  type: 'end';
};

export type PublishStep = PublishActionStep | PublishConditionStep | PublishEndStep;

export type PublishSkill = {
  id: string;
  name: string;
  platform: PublishPlatform;
  siteFingerprint?: string;
  description: string;
  version: number;
  isActive: boolean;
  inputSchema: Record<string, unknown>;
  variables: Record<string, unknown>;
  steps: PublishStep[];
  meta?: PublishSkillMeta;
};

export type PublishExecutionContext = {
  input: Record<string, unknown>;
  credentials: Record<string, unknown>;
  target: Record<string, unknown>;
};

export type PublishTraceStep = {
  stepId: string;
  action: string;
  params: Record<string, unknown>;
  result: BrowserStepResult;
};

export type BrowserWorkflowObservation = {
  key: string;
  format: 'html';
  value: string;
};

export type BrowserWorkflowRunResult = {
  status: 'success' | 'failed' | 'fallback';
  currentStepId: string | null;
  traceSteps: PublishTraceStep[];
  observations: Record<string, string>;
  failedStep?: PublishTraceStep;
  onFail?: PublishStepOnFail;
};

export type PublishTrace = {
  taskId: string;
  skillId: string;
  steps: PublishTraceStep[];
  status: 'success' | 'failed';
  createdAt: string;
};

export type PublishTaskResult = {
  taskId: string;
  skillId: string;
  status: 'success' | 'failed';
  trace: PublishTrace;
};

export type PublishTaskStatus = 'running' | 'success' | 'failed';

export type PublishTaskDto = {
  id: string;
  userId: string;
  jobDescriptionId: string;
  skillId: string;
  platform: PublishPlatform;
  input: Record<string, unknown>;
  currentStep: string | null;
  status: PublishTaskStatus;
  errorMessage: string | null;
  trace: PublishTrace | null;
  createdAt: string;
  updatedAt: string;
};
