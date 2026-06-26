import type {
  BrowserExecutor,
  BrowserStepResult,
  PublishActionStep,
  PublishExecutionContext,
  PublishSkill,
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

export async function runPublishingSkill(params: {
  taskId: string;
  skill: PublishSkill;
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<PublishTaskResult> {
  const { taskId, skill, executor, context } = params;
  const stepsById = new Map(skill.steps.map((step) => [step.id, step]));
  const traceSteps: PublishTraceStep[] = [];
  let currentStepId = skill.steps[0]?.id;
  let status: 'success' | 'failed' = 'success';
  let stoppedByTerminalStep = false;
  const maxIterations = Math.max(skill.steps.length * 3, 1);

  for (let iteration = 0; currentStepId && iteration < maxIterations; iteration += 1) {
    const step = stepsById.get(currentStepId);
    if (!step) {
      traceSteps.push({
        stepId: currentStepId,
        action: 'missing_step',
        params: {},
        result: { success: false, error: `step not found: ${currentStepId}` },
      });
      status = 'failed';
      break;
    }

    if (step.type === 'end') {
      stoppedByTerminalStep = true;
      break;
    }

    if (step.type === 'condition') {
      const check = interpolate(step.check, context) as typeof step.check;
      const ok = await executor.check(check);
      traceSteps.push({
        stepId: step.id,
        action: 'condition',
        params: check as unknown as Record<string, unknown>,
        result: { success: ok },
      });
      const next = ok ? step.ifTrue?.next : step.ifFalse?.next;
      if (!next) {
        status = ok ? 'success' : 'failed';
        stoppedByTerminalStep = true;
        break;
      }
      currentStepId = next;
      continue;
    }

    const resolvedParams = interpolate(step.params, context) as Record<string, unknown>;
    const result = await executeActionStep(step, resolvedParams, executor);
    traceSteps.push({
      stepId: step.id,
      action: step.action,
      params: resolvedParams,
      result,
    });
    if (!result.success) {
      status = 'failed';
      break;
    }
    currentStepId = step.next;
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
