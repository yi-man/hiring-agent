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

export type TargetDescriptor = {
  kind: 'field' | 'button' | 'link' | 'text' | 'container';
  role?: 'textbox' | 'button' | 'link' | 'form' | 'combobox';
  name: string;
  exact?: boolean;
  valueHint?: 'title' | 'company' | 'salary' | 'location' | 'description' | 'keyword';
  stableAttrs?: {
    testId?: string;
    id?: string;
    name?: string;
    ariaLabel?: string;
    autocomplete?: string;
  };
  scope?: {
    kind: 'form' | 'section' | 'dialog' | 'page';
    name?: string;
  };
};

export type DomCandidate = {
  tag: string;
  role?: string;
  accessibleName?: string;
  label?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  testId?: string;
  text?: string;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  cssPath?: string;
};

export type StructuredDomSnapshot = {
  url: string;
  title: string;
  pageState: 'login' | 'publish_form' | 'list' | 'unknown';
  headings: DomCandidate[];
  forms: Array<{
    name?: string;
    fields: DomCandidate[];
    buttons: DomCandidate[];
  }>;
  links: DomCandidate[];
  textBlocks: DomCandidate[];
};

export type LocatorMatchReport = {
  target: TargetDescriptor;
  status: 'unique' | 'not_found' | 'ambiguous' | 'low_confidence';
  strategy: string;
  strategiesTried?: string[];
  candidateCount: number;
  confidence: number;
  chosen?: DomCandidate;
  candidates: DomCandidate[];
  reason?: string;
};

export type BrowserTargetInput = string | TargetDescriptor;
export type BrowserStepTargetKey = 'target' | 'submitTarget';
export type BrowserCommandAction =
  | PublishSkillAction
  | 'check'
  | 'click_selector'
  | 'fill_selector'
  | 'snapshot_structured'
  | 'resolve_target';

export type BrowserCommand = {
  id: string;
  taskId: string;
  stepId: string;
  action: BrowserCommandAction;
  target?: TargetDescriptor;
  params: Record<string, unknown>;
  timeoutMs: number;
};

export type BrowserCommandResult = {
  commandId: string;
  success: boolean;
  error?: string;
  domSnapshot?: StructuredDomSnapshot;
  match?: LocatorMatchReport;
  failedTargetKey?: BrowserStepTargetKey;
};

export type BrowserCommandTransport = {
  send(command: BrowserCommand): Promise<BrowserCommandResult>;
  close?(): Promise<void>;
};

export type BrowserCommandContext = {
  taskId?: string;
  stepId?: string;
};

export type BrowserResolveOptions = {
  action?: PublishSkillAction | 'check';
  requireEditable?: boolean;
  timeoutMs?: number;
};

export type PublishSkillMeta = Record<string, unknown> & {
  success_rate?: number;
  usage_count?: number;
  created_from?: 'explore' | 'agent';
  repaired_from_skill_id?: string;
  repaired_from_version?: number;
  failed_step_id?: string;
  repair_reason?: string;
};

export type PublishStepOnFail = {
  type: 'abort' | 'fallback_agent';
  reason: string;
  repairSteps?: PublishStep[];
};

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
  description: string;
  version: number;
  isActive: boolean;
  inputSchema: Record<string, unknown>;
  variables: Record<string, unknown>;
  steps: PublishStep[];
  meta?: PublishSkillMeta;
};

export type BrowserStepResult = {
  success: boolean;
  error?: string;
  domSnapshot?: string | StructuredDomSnapshot;
  match?: LocatorMatchReport;
  failedTargetKey?: BrowserStepTargetKey;
};

export type BrowserExecutor = {
  setCommandContext?(context: BrowserCommandContext): void;
  navigate(url: string): Promise<BrowserStepResult>;
  fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult>;
  click(target: BrowserTargetInput): Promise<BrowserStepResult>;
  fillSelector?(selector: string, value: string): Promise<BrowserStepResult>;
  clickSelector?(selector: string): Promise<BrowserStepResult>;
  waitForUrl(url: string): Promise<BrowserStepResult>;
  check(check: PublishStepCheck): Promise<boolean>;
  waitForText?(text: string): Promise<BrowserStepResult>;
  addKeywords?(
    target: BrowserTargetInput,
    values: string[],
    submitTarget: BrowserTargetInput,
  ): Promise<BrowserStepResult>;
  snapshot?(): Promise<string>;
  snapshotStructured?(): Promise<StructuredDomSnapshot>;
  resolveTarget?(
    target: BrowserTargetInput,
    options?: BrowserResolveOptions,
  ): Promise<LocatorMatchReport>;
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
