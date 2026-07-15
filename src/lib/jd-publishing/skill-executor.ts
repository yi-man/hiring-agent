import type { BrowserAction } from '@/lib/browser/types';
import type {
  BrowserExecutor,
  BrowserTargetInput,
  BrowserStepResult,
  BrowserWorkflowObservation,
  BrowserWorkflowRunResult,
  PublishActionStep,
  PublishConditionStep,
  PublishExecutionContext,
  PublishSkill,
  PublishSkillAction,
  PublishStep,
  PublishStepCheck,
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

function isBrowserTargetInput(value: unknown): value is BrowserTargetInput {
  if (typeof value === 'string') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.kind === 'string' && typeof record.name === 'string';
}

function asBrowserTargetInput(preferred: unknown, legacyLocator: unknown): BrowserTargetInput {
  if (isBrowserTargetInput(preferred)) return preferred;
  return asString(legacyLocator);
}

function isBrowserAction(action: PublishSkillAction): action is BrowserAction {
  return [
    'navigate',
    'fill',
    'click',
    'wait_for_url',
    'wait_for_text',
    'wait_for_snapshot_change',
    'add_keywords',
  ].includes(action as BrowserAction);
}

function observationParams(
  params: Record<string, unknown>,
): { format: 'html'; saveAs: string } | null {
  const saveAs = asString(params.saveAs);
  if (params.format !== 'html' || !saveAs.trim()) {
    return null;
  }
  return { format: 'html', saveAs };
}

function readyChecks(params: Record<string, unknown>): PublishStepCheck[] {
  const value = params.readyChecks;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (candidate): candidate is PublishStepCheck =>
      Boolean(candidate) &&
      typeof candidate === 'object' &&
      ['dom_exists', 'text_contains', 'url_contains'].includes(
        (candidate as Record<string, unknown>).type as string,
      ),
  );
}

type ActionStepExecutionResult = {
  result: BrowserStepResult;
  observation?: BrowserWorkflowObservation;
};

async function executeActionStep(
  step: PublishActionStep,
  params: Record<string, unknown>,
  executor: BrowserExecutor,
  observations: Record<string, string>,
): Promise<ActionStepExecutionResult> {
  if (step.action === 'observe') {
    const observation = observationParams(params);
    if (!observation) {
      return { result: { success: false, error: 'invalid observe params' } };
    }
    if (!executor.snapshot) {
      return { result: { success: false, error: 'executor does not support snapshot' } };
    }
    let value: string;
    try {
      value = await executor.snapshot();
    } catch (error) {
      return {
        result: {
          success: false,
          error: error instanceof Error ? error.message : 'snapshot failed',
        },
      };
    }
    return {
      result: { success: true },
      observation: { key: observation.saveAs, format: observation.format, value },
    };
  }

  if (!isBrowserAction(step.action)) {
    return { result: { success: false, error: `unsupported action: ${step.action}` } };
  }

  if (step.action === 'navigate') {
    return { result: await executor.navigate(asString(params.url)) };
  }
  if (step.action === 'fill') {
    return {
      result: await executor.fill(
        asBrowserTargetInput(params.target, params.locator),
        asString(params.value),
      ),
    };
  }
  if (step.action === 'click') {
    return { result: await executor.click(asBrowserTargetInput(params.target, params.locator)) };
  }
  if (step.action === 'wait_for_url') {
    return { result: await executor.waitForUrl(asString(params.url)) };
  }
  if (step.action === 'wait_for_text') {
    if (!executor.waitForText) {
      return { result: { success: false, error: 'executor does not support wait_for_text' } };
    }
    return { result: await executor.waitForText(asString(params.text)) };
  }
  if (step.action === 'wait_for_snapshot_change') {
    if (!executor.waitForSnapshotChange) {
      return {
        result: { success: false, error: 'executor does not support wait_for_snapshot_change' },
      };
    }
    const observationKey = asString(params.previousObservationKey);
    let previousSnapshot = observations[observationKey];
    let previousUrl = asString(params.previousUrl) || undefined;
    if (!observationKey || !previousSnapshot) {
      return { result: { success: false, error: 'missing snapshot observation' } };
    }
    const checks = readyChecks(params);
    const maxAttempts = checks.length > 0 ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const result = await executor.waitForSnapshotChange(previousSnapshot, previousUrl);
      previousUrl = undefined;
      if (!result.success || checks.length === 0) return { result };
      if ((await Promise.all(checks.map((check) => executor.check(check)))).some(Boolean)) {
        return { result };
      }
      if (!executor.snapshot) {
        return { result: { success: false, error: 'executor does not support snapshot' } };
      }
      try {
        previousSnapshot = await executor.snapshot();
      } catch (error) {
        return {
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'snapshot failed',
          },
        };
      }
    }
    return { result: { success: false, error: 'snapshot readiness checks timed out' } };
  }
  if (step.action === 'add_keywords') {
    if (!executor.addKeywords) {
      return { result: { success: false, error: 'executor does not support add_keywords' } };
    }
    return {
      result: await executor.addKeywords(
        asBrowserTargetInput(params.target, params.locator),
        asStringList(params.values),
        asBrowserTargetInput(params.submitTarget, params.submitLocator),
      ),
    };
  }
  return { result: { success: false, error: `unsupported action: ${step.action}` } };
}

export type PublishingStepExecutionResult = {
  status: 'running' | 'success' | 'failed' | 'fallback';
  nextStepId: string | null;
  traceStep?: PublishTraceStep;
  observation?: BrowserWorkflowObservation;
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
  observations?: Record<string, string>;
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
  const { observation, result } = await executeActionStep(
    step,
    resolvedParams,
    executor,
    params.observations ?? {},
  );
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
    observation,
    step,
  };
}

export async function runBrowserWorkflow(params: {
  skill: PublishSkill;
  currentStepId?: string | null;
  executor: BrowserExecutor;
  context: PublishExecutionContext;
  onStep?: (params: { stepId: string; step: PublishStep }) => void | Promise<void>;
}): Promise<BrowserWorkflowRunResult> {
  const { skill, executor, context } = params;
  const traceSteps: PublishTraceStep[] = [];
  const observations: Record<string, string> = {};
  let currentStepId: string | null = params.currentStepId ?? skill.steps[0]?.id ?? null;
  let status: BrowserWorkflowRunResult['status'] = 'success';
  let failedStep: PublishTraceStep | undefined;
  let onFail: PublishStepOnFail | undefined;
  let stoppedByTerminalStep = false;
  const maxIterations = Math.max(skill.steps.length * 3, 1);

  for (let iteration = 0; currentStepId && iteration < maxIterations; iteration += 1) {
    const currentStep = skill.steps.find((step) => step.id === currentStepId);
    if (currentStep && currentStep.type !== 'end') {
      await params.onStep?.({ stepId: currentStepId, step: currentStep });
    }
    const result = await executePublishingStep({
      stepId: currentStepId,
      skill,
      executor,
      context,
      observations,
    });
    if (result.traceStep) {
      traceSteps.push(result.traceStep);
    }
    if (result.observation) {
      observations[result.observation.key] = result.observation.value;
    }
    if (result.status === 'success') {
      stoppedByTerminalStep = true;
      currentStepId = null;
      break;
    }
    if (result.status === 'failed' || result.status === 'fallback') {
      status = result.status;
      failedStep = result.traceStep;
      onFail = result.onFail;
      break;
    }
    currentStepId = result.nextStepId;
  }

  if (currentStepId && status === 'success' && !stoppedByTerminalStep) {
    status = 'failed';
    failedStep = {
      stepId: currentStepId,
      action: 'iteration_guard',
      params: { maxIterations },
      result: {
        success: false,
        error: `step iteration guard exceeded at: ${currentStepId}`,
      },
    };
    traceSteps.push(failedStep);
  }

  return {
    status,
    currentStepId,
    traceSteps,
    observations,
    ...(failedStep ? { failedStep } : {}),
    ...(onFail ? { onFail } : {}),
  };
}

export async function runPublishingSkill(params: {
  taskId: string;
  skill: PublishSkill;
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<PublishTaskResult> {
  const { taskId, skill, executor, context } = params;
  const workflow = await runBrowserWorkflow({ skill, executor, context });
  const status: 'success' | 'failed' = workflow.status === 'success' ? 'success' : 'failed';
  const trace = {
    taskId,
    skillId: skill.id,
    steps: workflow.traceSteps,
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
