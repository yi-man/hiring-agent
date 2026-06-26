import type {
  BrowserExecutor,
  BrowserStepResult,
  PublishActionStep,
  PublishConditionStep,
  PublishExecutionContext,
  PublishSkill,
  PublishStep,
  PublishStepOnFail,
  PublishTaskResult,
  PublishTraceStep,
} from './types';

function readPath(context: PublishExecutionContext, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = context;
  for (const part of parts) {
    if (!value || typeof value !== 'object' || !(part in value)) return '';
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function interpolate(value: unknown, context: PublishExecutionContext): unknown {
  if (typeof value === 'string') {
    const wholeExpression = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (wholeExpression) {
      return readPath(context, wholeExpression[1].trim());
    }
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
      const next = readPath(context, path.trim());
      return typeof next === 'string' || typeof next === 'number' || typeof next === 'boolean'
        ? String(next)
        : '';
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolate(item, context));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolate(item, context)]),
    );
  }
  return value;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

async function executeActionStep(
  step: PublishActionStep,
  params: Record<string, unknown>,
  executor: BrowserExecutor,
): Promise<BrowserStepResult> {
  if (step.action === 'navigate') {
    return executor.navigate(asString(params.url));
  }
  if (step.action === 'fill') {
    return executor.fill(asString(params.locator), asString(params.value));
  }
  if (step.action === 'click') {
    return executor.click(asString(params.locator));
  }
  if (step.action === 'wait_for_url') {
    return executor.waitForUrl(asString(params.url));
  }
  if (step.action === 'wait_for_text') {
    if (!executor.waitForText) {
      return { success: false, error: 'executor does not support wait_for_text' };
    }
    return executor.waitForText(asString(params.text));
  }
  if (step.action === 'add_keywords') {
    if (!executor.addKeywords) {
      return { success: false, error: 'executor does not support add_keywords' };
    }
    return executor.addKeywords(
      asString(params.locator),
      asStringList(params.values),
      asString(params.submitLocator),
    );
  }
  return { success: false, error: `unsupported action: ${step.action}` };
}

export type PublishingStepExecutionResult = {
  status: 'running' | 'success' | 'failed' | 'fallback';
  nextStepId: string | null;
  traceStep?: PublishTraceStep;
  onFail?: PublishStepOnFail;
  step?: PublishStep;
};

function missingStepResult(stepId: string): PublishingStepExecutionResult {
  return {
    status: 'failed',
    nextStepId: null,
    traceStep: {
      stepId,
      action: 'missing_step',
      params: {},
      result: { success: false, error: `step not found: ${stepId}` },
    },
  };
}

function endStepResult(step: PublishStep): PublishingStepExecutionResult {
  return {
    status: 'success',
    nextStepId: null,
    step,
  };
}

function routeFailure(
  step: PublishActionStep | PublishConditionStep,
  traceStep: PublishTraceStep,
): PublishingStepExecutionResult {
  if (step.onFail?.type === 'fallback_agent') {
    return {
      status: 'fallback',
      nextStepId: null,
      traceStep,
      onFail: step.onFail,
      step,
    };
  }
  return {
    status: 'failed',
    nextStepId: null,
    traceStep,
    onFail: step.onFail,
    step,
  };
}

export async function executePublishingStep(params: {
  stepId: string;
  skill: PublishSkill;
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<PublishingStepExecutionResult> {
  const { stepId, skill, executor, context } = params;
  const step = skill.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    return missingStepResult(stepId);
  }

  if (step.type === 'end') {
    return endStepResult(step);
  }

  if (step.type === 'condition') {
    const check = interpolate(step.check, context) as typeof step.check;
    const ok = await executor.check(check);
    const traceStep: PublishTraceStep = {
      stepId: step.id,
      action: 'condition',
      params: check as unknown as Record<string, unknown>,
      result: { success: ok },
    };
    const nextStepId = ok ? step.ifTrue?.next : step.ifFalse?.next;
    if (nextStepId) {
      return { status: 'running', nextStepId, traceStep, step };
    }
    return ok
      ? { status: 'success', nextStepId: null, traceStep, step }
      : routeFailure(step, traceStep);
  }

  const resolvedParams = interpolate(step.params, context) as Record<string, unknown>;
  const result = await executeActionStep(step, resolvedParams, executor);
  const traceStep: PublishTraceStep = {
    stepId: step.id,
    action: step.action,
    params: resolvedParams,
    result,
  };
  if (!result.success) {
    return routeFailure(step, traceStep);
  }
  return {
    status: 'running',
    nextStepId: step.next,
    traceStep,
    step,
  };
}

export async function runPublishingSkill(params: {
  taskId: string;
  skill: PublishSkill;
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<PublishTaskResult> {
  const { taskId, skill, executor, context } = params;
  const traceSteps: PublishTraceStep[] = [];
  let currentStepId: string | null = skill.steps[0]?.id ?? null;
  let status: 'success' | 'failed' = 'success';
  let stoppedByTerminalStep = false;
  const maxIterations = Math.max(skill.steps.length * 3, 1);

  for (let iteration = 0; currentStepId && iteration < maxIterations; iteration += 1) {
    const result = await executePublishingStep({
      stepId: currentStepId,
      skill,
      executor,
      context,
    });
    if (result.traceStep) {
      traceSteps.push(result.traceStep);
    }
    if (result.status === 'success') {
      stoppedByTerminalStep = true;
      break;
    }
    if (result.status === 'failed' || result.status === 'fallback') {
      status = 'failed';
      break;
    }
    currentStepId = result.nextStepId;
  }

  if (currentStepId && status === 'success' && !stoppedByTerminalStep) {
    status = 'failed';
    traceSteps.push({
      stepId: currentStepId,
      action: 'iteration_guard',
      params: { maxIterations },
      result: {
        success: false,
        error: `step iteration guard exceeded at: ${currentStepId}`,
      },
    });
  }

  const trace = {
    taskId,
    skillId: skill.id,
    steps: traceSteps,
    status,
    createdAt: new Date().toISOString(),
  };

  return {
    taskId,
    skillId: skill.id,
    status,
    trace,
  };
}
