export type BrowserAction =
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
  valueHint?: string;
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
  | BrowserAction
  | 'check'
  | 'click_selector'
  | 'fill_selector'
  | 'snapshot'
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
  htmlSnapshot?: string;
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
  action?: BrowserAction | 'check';
  requireEditable?: boolean;
  timeoutMs?: number;
};

export type BrowserStepCheck = {
  id?: string;
  type: 'dom_exists' | 'text_contains' | 'url_contains';
  selector?: string;
  text?: string;
  timeout?: number;
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
  check(check: BrowserStepCheck): Promise<boolean>;
  waitForText?(text: string): Promise<BrowserStepResult>;
  waitForTarget?(target: BrowserTargetInput): Promise<BrowserStepResult>;
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
