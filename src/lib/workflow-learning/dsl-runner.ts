import type { WorkflowDsl, WorkflowStep } from '@/lib/workflow-learning/dsl';
import type {
  BrowserSessionManager,
  LoginSuccessCriteria,
} from '@/lib/workflow-learning/tools/browser-session';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';

export type DslRunnerEvent = Omit<
  Extract<WorkflowSseEvent, { type: 'dsl_replay_step' }>,
  'runId' | 'timestamp'
>;

export type DslRunnerManager = Pick<
  BrowserSessionManager,
  'inspectLogin' | 'openLogin' | 'navigate' | 'waitForText' | 'extractText'
>;

export type DslRunnerResult =
  | {
      ok: true;
      outputs: Record<string, string>;
    }
  | {
      ok: false;
      outputs: Record<string, string>;
      error?: string;
      awaitingLogin?: { loginUrl: string };
    };

type AssertionContext = {
  latestUrl: string;
  latestText: string;
};

export async function runWorkflowDsl(input: {
  workflow: WorkflowDsl;
  sessionId: string;
  manager: DslRunnerManager;
  emit: (event: DslRunnerEvent) => void;
}): Promise<DslRunnerResult> {
  const outputs: Record<string, string> = {};
  const loginResults = new Map<string, boolean>();
  const assertionContext: AssertionContext = { latestUrl: '', latestText: '' };
  let latestLoginCheck: boolean | undefined;
  let sortedSteps: WorkflowDsl['steps'];

  try {
    sortedSteps = sortStepsByDependencies(input.workflow.steps);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DSL dependency error';
    if (error instanceof DependencySortError) {
      emitStep(input.emit, error.step, 'failed', { error: message });
    } else {
      input.emit({
        type: 'dsl_replay_step',
        stepId: 'dependency-order',
        stepType: 'dependency_order',
        status: 'failed',
        error: message,
      });
    }
    return { ok: false, outputs, error: message };
  }

  for (const step of sortedSteps) {
    emitStep(input.emit, step, 'running');

    try {
      if (step.type === 'check_login') {
        const result = await input.manager.inspectLogin({
          sessionId: input.sessionId,
          success: loginSuccessFromDetector(step.target.detector),
        });
        latestLoginCheck = result.loggedIn;
        loginResults.set(step.id, result.loggedIn);
        assertionContext.latestUrl = result.url;
        assertionContext.latestText = result.excerpt;
        emitStep(input.emit, step, 'success', {
          message: result.loggedIn ? 'Login already verified' : 'Login required',
          outputPreview: result.excerpt,
        });
        continue;
      }

      if (step.type === 'login') {
        const dependencyLoggedIn = step.dependsOn?.some((dependency) =>
          loginResults.get(dependency),
        );
        if (dependencyLoggedIn || latestLoginCheck) {
          emitStep(input.emit, step, 'skipped', {
            message: 'Skipped because check_login succeeded',
          });
          continue;
        }

        const login = await input.manager.openLogin({
          sessionId: input.sessionId,
          loginUrl: step.targetUrl,
        });
        emitStep(input.emit, step, 'failed', {
          message: 'Login required before replay can continue',
        });
        return {
          ok: false,
          outputs,
          awaitingLogin: { loginUrl: login.loginUrl },
        };
      }

      if (step.type === 'browser_action') {
        await runBrowserAction(step, input.sessionId, input.manager, outputs, assertionContext);
        emitStep(input.emit, step, 'success', {
          outputPreview: step.outputKey ? outputs[step.outputKey] : undefined,
        });
        continue;
      }

      assertStep(step, outputs, assertionContext);
      emitStep(input.emit, step, 'success', {
        outputPreview: step.expect.outputKey ? outputs[step.expect.outputKey] : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown DSL replay error';
      emitStep(input.emit, step, 'failed', { error: message });
      return { ok: false, outputs, error: message };
    }
  }

  return { ok: true, outputs };
}

async function runBrowserAction(
  step: Extract<WorkflowStep, { type: 'browser_action' }>,
  sessionId: string,
  manager: DslRunnerManager,
  outputs: Record<string, string>,
  assertionContext: AssertionContext,
): Promise<void> {
  if (step.action === 'navigate') {
    if (!step.target.url) throw new Error(`Missing URL for ${step.id}`);
    const result = await manager.navigate({ sessionId, url: step.target.url });
    assertionContext.latestUrl = result.url;
    assertionContext.latestText = result.excerpt;
    return;
  }

  if (step.action === 'wait_for_text') {
    if (!step.target.text) throw new Error(`Missing text for ${step.id}`);
    const result = await manager.waitForText({ sessionId, text: step.target.text });
    assertionContext.latestUrl = result.url;
    assertionContext.latestText = result.excerpt;
    if (!result.found) {
      throw new Error(`Text not found: ${step.target.text}`);
    }
    return;
  }

  if (step.action === 'extract_text') {
    if (!step.outputKey) throw new Error(`Missing output key for ${step.id}`);
    const result = await manager.extractText({
      sessionId,
      selectorHint: step.target.selectorHint,
    });
    outputs[step.outputKey] = result.text;
    assertionContext.latestUrl = result.url;
    assertionContext.latestText = result.text;
    return;
  }

  throw new Error(`Unsupported browser action: ${step.action}`);
}

function assertStep(
  step: Extract<WorkflowStep, { type: 'assertion' }>,
  outputs: Record<string, string>,
  context: AssertionContext,
): void {
  for (const expectedUrl of step.expect.urlIncludes ?? []) {
    if (!context.latestUrl.includes(expectedUrl)) {
      throw new Error(`Expected URL not found: ${expectedUrl}`);
    }
  }

  for (const expectedText of step.expect.textIncludes ?? []) {
    if (!context.latestText.includes(expectedText)) {
      throw new Error(`Expected text not found: ${expectedText}`);
    }
  }

  if (step.expect.outputKey && !outputs[step.expect.outputKey]?.trim()) {
    throw new Error(`Missing output for ${step.expect.outputKey}`);
  }
}

function loginSuccessFromDetector(
  detector: Extract<WorkflowStep, { type: 'check_login' }>['target']['detector'],
): LoginSuccessCriteria {
  const success: LoginSuccessCriteria = {};
  if (detector.loggedInUrlIncludes?.length) {
    success.urlIncludes = detector.loggedInUrlIncludes;
  }
  if (detector.loggedInTextIncludes?.length) {
    success.textIncludes = detector.loggedInTextIncludes;
  }
  if (detector.loginUrlIncludes?.length) {
    success.urlNotIncludes = detector.loginUrlIncludes;
  }
  if (detector.loginTextIncludes?.length) {
    success.textNotIncludes = detector.loginTextIncludes;
  }
  return success;
}

function emitStep(
  emit: (event: DslRunnerEvent) => void,
  step: WorkflowStep,
  status: DslRunnerEvent['status'],
  extra: Partial<Pick<DslRunnerEvent, 'message' | 'outputPreview' | 'error'>> = {},
): void {
  emit({
    type: 'dsl_replay_step',
    stepId: step.id,
    stepType: step.type,
    status,
    ...extra,
  });
}

function sortStepsByDependencies(steps: WorkflowDsl['steps']): WorkflowDsl['steps'] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const sorted: WorkflowDsl['steps'] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(step: WorkflowStep): void {
    if (visited.has(step.id)) return;
    if (visiting.has(step.id)) {
      throw new DependencySortError(`Dependency cycle detected at ${step.id}`, step);
    }

    visiting.add(step.id);
    for (const dependencyId of step.dependsOn ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw new DependencySortError(`Unknown dependency: ${dependencyId}`, step);
      }
      visit(dependency);
    }
    visiting.delete(step.id);
    visited.add(step.id);
    sorted.push(step);
  }

  for (const step of steps) {
    visit(step);
  }

  return sorted;
}

class DependencySortError extends Error {
  constructor(
    message: string,
    readonly step: WorkflowStep,
  ) {
    super(message);
  }
}
