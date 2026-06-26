export type PublishPlatform = 'boss-like';

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

export type PublishSkillAction =
  | 'navigate'
  | 'fill'
  | 'click'
  | 'wait_for_url'
  | 'wait_for_text'
  | 'add_keywords';

export type PublishStepCheck = {
  id?: string;
  type: 'dom_exists' | 'text_contains' | 'url_contains';
  selector?: string;
  text?: string;
  timeout?: number;
};

export type PublishActionStep = {
  id: string;
  type: 'action';
  action: PublishSkillAction;
  params: Record<string, unknown>;
  next: string;
};

export type PublishConditionStep = {
  id: string;
  type: 'condition';
  check: PublishStepCheck;
  ifTrue?: { next: string };
  ifFalse?: { next: string };
  onFail?: {
    type: 'abort' | 'fallback_agent';
    reason: string;
  };
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
  description: string;
  version: number;
  isActive: boolean;
  inputSchema: Record<string, unknown>;
  variables: Record<string, unknown>;
  steps: PublishStep[];
};

export type BrowserStepResult = {
  success: boolean;
  error?: string;
  domSnapshot?: string;
};

export type BrowserExecutor = {
  navigate(url: string): Promise<BrowserStepResult>;
  fill(locator: string, value: string): Promise<BrowserStepResult>;
  click(locator: string): Promise<BrowserStepResult>;
  waitForUrl(url: string): Promise<BrowserStepResult>;
  check(check: PublishStepCheck): Promise<boolean>;
  waitForText?(text: string): Promise<BrowserStepResult>;
  addKeywords?(
    locator: string,
    values: string[],
    submitLocator: string,
  ): Promise<BrowserStepResult>;
  close?(): Promise<void>;
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
