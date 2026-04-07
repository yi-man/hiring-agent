import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { runBrowserSnapshot } from '@/lib/workflow-learning/tools/browser-snapshot-tool';
import type {
  StoredWorkflow,
  WorkflowRunResult,
  WorkflowRunStepResult,
  WorkflowStep,
} from '@/lib/workflow-learning/workflow-types';
import { prisma } from '@/lib/prisma';
import { runWorkflowAgentWithEvents } from '@/lib/workflow-learning/agent-runner';
import { solidifyWorkflowFromEvents } from '@/lib/workflow-learning/workflow-solidifier';
import { updateWorkflowSteps } from '@/lib/workflow-learning/workflow-store';

async function executeOne(step: WorkflowStep): Promise<WorkflowRunStepResult> {
  const startedAt = Date.now();
  try {
    if (step.tool === 'browser_snapshot') {
      const url = typeof step.args.url === 'string' ? step.args.url : '';
      if (!url) throw new Error('browser_snapshot requires args.url');
      const output = await runBrowserSnapshot(url);
      const result = JSON.stringify(output);
      return {
        stepId: step.id,
        tool: step.tool,
        ok: true,
        result,
        durationMs: Date.now() - startedAt,
      };
    }
    throw new Error(`Unsupported workflow tool: ${step.tool}`);
  } catch (error) {
    return {
      stepId: step.id,
      tool: step.tool,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown step error',
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runWorkflow(workflow: StoredWorkflow): Promise<WorkflowRunStepResult[]> {
  const out: WorkflowRunStepResult[] = [];
  for (const step of workflow.steps) {
    const result = await executeOne(step);
    out.push(result);
    if (!result.ok) break;
  }
  return out;
}

async function recoverWorkflow(
  userId: string,
  workflow: StoredWorkflow,
): Promise<StoredWorkflow | null> {
  const runId = randomUUID();
  const events = [];
  for await (const ev of runWorkflowAgentWithEvents({ runId, userText: workflow.goal })) {
    events.push(ev);
  }
  const nextSteps = await solidifyWorkflowFromEvents(workflow.goal, events);
  if (!nextSteps.length) return null;
  return updateWorkflowSteps({
    workflowId: workflow.id,
    userId,
    steps: nextSteps,
    reason: 'auto recovery after deterministic execution failure',
  });
}

export async function executeWorkflowWithRecovery(input: {
  userId: string;
  workflow: StoredWorkflow;
}): Promise<WorkflowRunResult> {
  const run = await prisma.workflowLearningRun.create({
    data: {
      workflowId: input.workflow.id,
      userId: input.userId,
      status: 'running',
    },
  });

  const firstRun = await runWorkflow(input.workflow);
  for (const step of firstRun) {
    await prisma.workflowLearningRunStep.create({
      data: {
        runId: run.id,
        stepId: step.stepId,
        tool: step.tool,
        status: step.ok ? 'success' : 'failed',
        args: (input.workflow.steps.find((s) => s.id === step.stepId)?.args ??
          {}) as Prisma.InputJsonValue,
        result: step.result,
        error: step.error,
        durationMs: step.durationMs,
      },
    });
  }

  const failed = firstRun.find((s) => !s.ok);
  if (!failed) {
    await prisma.workflowLearningRun.update({
      where: { id: run.id },
      data: { status: 'done', recovered: false },
    });
    return {
      runId: run.id,
      workflowId: input.workflow.id,
      success: true,
      recovered: false,
      steps: firstRun,
    };
  }

  let repaired: StoredWorkflow | null = null;
  try {
    repaired = await recoverWorkflow(input.userId, input.workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recovery failed';
    await prisma.workflowLearningRun.update({
      where: { id: run.id },
      data: { status: 'failed', recovered: false, errorMessage: message },
    });
    return {
      runId: run.id,
      workflowId: input.workflow.id,
      success: false,
      recovered: false,
      error: message,
      steps: firstRun,
    };
  }

  if (!repaired) {
    await prisma.workflowLearningRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        recovered: false,
        errorMessage: failed.error ?? 'Execution failed',
      },
    });
    return {
      runId: run.id,
      workflowId: input.workflow.id,
      success: false,
      recovered: false,
      error: failed.error,
      steps: firstRun,
    };
  }

  const secondRun = await runWorkflow(repaired);
  for (const step of secondRun) {
    await prisma.workflowLearningRunStep.create({
      data: {
        runId: run.id,
        stepId: `recovered_${step.stepId}`,
        tool: step.tool,
        status: step.ok ? 'success' : 'failed',
        args: (repaired.steps.find((s) => s.id === step.stepId)?.args ??
          {}) as Prisma.InputJsonValue,
        result: step.result,
        error: step.error,
        durationMs: step.durationMs,
      },
    });
  }

  const recoveredFailed = secondRun.find((s) => !s.ok);
  const recovered = !recoveredFailed;
  await prisma.workflowLearningRun.update({
    where: { id: run.id },
    data: {
      status: recovered ? 'done' : 'failed',
      recovered,
      errorMessage: recoveredFailed?.error ?? null,
    },
  });

  return {
    runId: run.id,
    workflowId: repaired.id,
    success: recovered,
    recovered,
    error: recoveredFailed?.error,
    steps: [...firstRun, ...secondRun],
  };
}
