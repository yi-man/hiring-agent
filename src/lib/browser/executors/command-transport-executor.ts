import type {
  BrowserCommand,
  BrowserCommandAction,
  BrowserCommandContext,
  BrowserCommandResult,
  BrowserCommandTransport,
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserStepCheck,
  BrowserStepResult,
  BrowserTargetInput,
  LocatorMatchReport,
  StructuredDomSnapshot,
  TargetDescriptor,
} from '@/lib/browser/types';

const DEFAULT_TIMEOUT_MS = 30_000;

function randomCommandId(): string {
  return `browser-command-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function targetFromString(target: string, action: BrowserCommandAction): TargetDescriptor {
  const kind: TargetDescriptor['kind'] =
    action === 'fill' || action === 'add_keywords'
      ? 'field'
      : action === 'click'
        ? 'button'
        : action === 'wait_for_text' || action === 'check'
          ? 'text'
          : 'container';
  return {
    kind,
    role: kind === 'field' ? 'textbox' : kind === 'button' ? 'button' : undefined,
    name: target,
    exact: false,
  };
}

function normalizeTarget(
  target: BrowserTargetInput | undefined,
  action: BrowserCommandAction,
): TargetDescriptor | undefined {
  if (!target) return undefined;
  return typeof target === 'string' ? targetFromString(target, action) : target;
}

function normalizeResult(result: BrowserCommandResult): BrowserStepResult {
  return {
    success: result.success,
    error: result.error,
    domSnapshot: result.domSnapshot,
    match: result.match,
    failedTargetKey: result.failedTargetKey,
  };
}

export class CommandTransportBrowserExecutor implements BrowserExecutor {
  private commandContext: BrowserCommandContext = {};

  constructor(
    private readonly options: {
      transport: BrowserCommandTransport;
      taskId?: string | (() => string | undefined);
      stepId?: string | (() => string | undefined);
      timeoutMs?: number;
      idGenerator?: () => string;
    },
  ) {}

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  setCommandContext(context: BrowserCommandContext): void {
    if (Object.prototype.hasOwnProperty.call(context, 'taskId')) {
      if (context.taskId) {
        this.commandContext.taskId = context.taskId;
      } else {
        delete this.commandContext.taskId;
      }
    }
    if (Object.prototype.hasOwnProperty.call(context, 'stepId')) {
      if (context.stepId) {
        this.commandContext.stepId = context.stepId;
      } else {
        delete this.commandContext.stepId;
      }
    }
  }

  private currentTaskId(): string {
    const configured =
      typeof this.options.taskId === 'function' ? this.options.taskId() : this.options.taskId;
    return configured ?? this.commandContext.taskId ?? '';
  }

  private currentStepId(): string {
    const configured =
      typeof this.options.stepId === 'function' ? this.options.stepId() : this.options.stepId;
    return configured ?? this.commandContext.stepId ?? '';
  }

  private async send(
    action: BrowserCommandAction,
    params: Record<string, unknown>,
    target?: BrowserTargetInput,
  ): Promise<BrowserCommandResult> {
    const command: BrowserCommand = {
      id: this.options.idGenerator?.() ?? randomCommandId(),
      taskId: this.currentTaskId(),
      stepId: this.currentStepId(),
      action,
      target: normalizeTarget(target, action),
      params,
      timeoutMs: this.timeoutMs,
    };
    const result = await this.options.transport.send(command);
    if (result.commandId !== command.id) {
      return {
        commandId: command.id,
        success: false,
        error: `browser_command_result_mismatch: expected ${command.id}, received ${result.commandId}`,
      };
    }
    return result;
  }

  async navigate(url: string): Promise<BrowserStepResult> {
    return normalizeResult(await this.send('navigate', { url }));
  }

  async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
    return normalizeResult(await this.send('fill', { value }, target));
  }

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    return normalizeResult(await this.send('click', {}, target));
  }

  async fillSelector(selector: string, value: string): Promise<BrowserStepResult> {
    return normalizeResult(await this.send('fill_selector', { selector, value }));
  }

  async clickSelector(selector: string): Promise<BrowserStepResult> {
    return normalizeResult(await this.send('click_selector', { selector }));
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    return normalizeResult(await this.send('wait_for_url', { url }));
  }

  async waitForText(text: string): Promise<BrowserStepResult> {
    return normalizeResult(
      await this.send('wait_for_text', { text }, { kind: 'text', name: text, exact: false }),
    );
  }

  async addKeywords(
    target: BrowserTargetInput,
    values: string[],
    submitTarget: BrowserTargetInput,
  ): Promise<BrowserStepResult> {
    return normalizeResult(
      await this.send(
        'add_keywords',
        {
          values,
          submitTarget: normalizeTarget(submitTarget, 'click'),
        },
        target,
      ),
    );
  }

  async check(check: BrowserStepCheck): Promise<boolean> {
    return (await this.send('check', { check })).success;
  }

  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    const result = await this.send('snapshot_structured', {});
    if (!result.success || !result.domSnapshot) {
      throw new Error(result.error ?? 'snapshot_structured command returned no snapshot');
    }
    return result.domSnapshot;
  }

  async resolveTarget(
    target: BrowserTargetInput,
    options: BrowserResolveOptions = {},
  ): Promise<LocatorMatchReport> {
    const result = await this.send('resolve_target', { options }, target);
    if (!result.success || !result.match) {
      throw new Error(result.error ?? 'resolve_target command returned no match report');
    }
    return result.match;
  }

  async close(): Promise<void> {
    await this.options.transport.close?.();
  }
}
