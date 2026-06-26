import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { JobDescriptionDto } from '@/types';
import { exploreBossLikePublishSkill } from './explore';
import { buildBossLikeJobPayload } from './publish-payload';
import {
  completePublishTask,
  createExploredPublishSkill,
  createNextActivePublishSkillVersion,
  createPublishTask,
  getActivePublishSkillFromDb,
  updatePublishTaskCurrentStep,
} from './publish-repo';
import { executePublishingStep } from './skill-executor';
import type {
  BrowserExecutor,
  PublishExecutionContext,
  PublishJobDescriptionSettings,
  PublishPlatform,
  PublishSkill,
  PublishSkillMeta,
  PublishStep,
  PublishStepOnFail,
  PublishTaskDto,
  PublishTaskResult,
  PublishTraceStep,
} from './types';

type PublishingRoute = 'execute' | 'fallback' | 'upgrade' | 'finalize';

export type PublishingGraphDependencies = {
  getActiveSkill?: (platform: PublishPlatform) => Promise<PublishSkill | null>;
  exploreSkill?: (params: {
    executor: BrowserExecutor;
    context: PublishExecutionContext;
  }) => Promise<PublishSkill>;
  createExploredSkill?: (skill: PublishSkill) => Promise<PublishSkill>;
  createTask?: typeof createPublishTask;
  updateTaskCurrentStep?: typeof updatePublishTaskCurrentStep;
  completeTask?: typeof completePublishTask;
  createNextSkillVersion?: (params: {
    previousSkill: PublishSkill;
    steps: PublishStep[];
    meta?: PublishSkillMeta;
  }) => Promise<PublishSkill>;
};

const PublishingState = Annotation.Root({
  jobDescription: Annotation<JobDescriptionDto>(),
  settings: Annotation<PublishJobDescriptionSettings>(),
  executor: Annotation<BrowserExecutor>(),
  credentials: Annotation<Record<string, unknown>>(),
  target: Annotation<Record<string, unknown>>(),
  input: Annotation<Record<string, unknown>>(),
  context: Annotation<PublishExecutionContext>(),
  skill: Annotation<PublishSkill | undefined>(),
  task: Annotation<PublishTaskDto | undefined>(),
  currentStepId: Annotation<string | undefined>(),
  traceSteps: Annotation<PublishTraceStep[]>(),
  status: Annotation<'running' | 'success' | 'failed'>(),
  route: Annotation<PublishingRoute>(),
  onFail: Annotation<PublishStepOnFail | undefined>(),
  failedTraceStep: Annotation<PublishTraceStep | undefined>(),
  repairSteps: Annotation<PublishStep[] | undefined>(),
  errorMessage: Annotation<string | undefined>(),
});

type PublishingGraphState = typeof PublishingState.State;
type PublishingGraphUpdate = typeof PublishingState.Update;

function requireSkill(state: PublishingGraphState): PublishSkill {
  if (!state.skill) {
    throw new Error('publish skill is required before task creation');
  }
  return state.skill;
}

function requireTask(state: PublishingGraphState): PublishTaskDto {
  if (!state.task) {
    throw new Error('publish task is required before finalization');
  }
  return state.task;
}

function appendTrace(
  state: PublishingGraphState,
  traceStep: PublishTraceStep | undefined,
): PublishTraceStep[] {
  return traceStep ? [...state.traceSteps, traceStep] : state.traceSteps;
}

function lastError(traceStep?: PublishTraceStep, fallbackReason?: string): string | undefined {
  return traceStep?.result.error ?? fallbackReason;
}

function buildFallbackTraceStep(state: PublishingGraphState): PublishTraceStep {
  const repairAvailable = Boolean(state.repairSteps?.length);
  return {
    stepId: 'fallback_agent',
    action: 'fallback_agent',
    params: {
      failedStepId: state.failedTraceStep?.stepId ?? '',
      reason: state.onFail?.reason ?? state.errorMessage ?? 'step failed',
      repairAvailable,
    },
    result: {
      success: repairAvailable,
      error: repairAvailable ? undefined : (state.errorMessage ?? state.onFail?.reason),
      domSnapshot: state.failedTraceStep?.result.domSnapshot,
    },
  };
}

function buildSkillUpgradeTraceStep(params: {
  previousSkill: PublishSkill;
  nextSkill: PublishSkill;
}): PublishTraceStep {
  return {
    stepId: 'skill_upgrade',
    action: 'skill_upgrade',
    params: {
      previousSkillId: params.previousSkill.id,
      previousVersion: params.previousSkill.version,
      nextSkillId: params.nextSkill.id,
      nextVersion: params.nextSkill.version,
    },
    result: { success: true },
  };
}

function routeAfterStep(state: PublishingGraphState): PublishingRoute {
  return state.route;
}

function makeGraph(dependencies: Required<PublishingGraphDependencies>) {
  async function prepareNode(state: PublishingGraphState): Promise<PublishingGraphUpdate> {
    const input = buildBossLikeJobPayload(state.jobDescription, state.settings);
    const context: PublishExecutionContext = {
      input,
      credentials: state.credentials,
      target: state.target,
    };
    return { input, context, status: 'running', route: 'execute' };
  }

  async function exploreOrLoadSkillNode(
    state: PublishingGraphState,
  ): Promise<PublishingGraphUpdate> {
    const activeSkill = await dependencies.getActiveSkill(state.settings.platform);
    if (activeSkill) {
      return {
        skill: activeSkill,
        currentStepId: activeSkill.steps[0]?.id,
      };
    }

    const explored = await dependencies.exploreSkill({
      executor: state.executor,
      context: state.context,
    });
    const saved = await dependencies.createExploredSkill(explored);
    return {
      skill: saved,
      currentStepId: saved.steps[0]?.id,
    };
  }

  async function createTaskNode(state: PublishingGraphState): Promise<PublishingGraphUpdate> {
    const skill = requireSkill(state);
    const task = await dependencies.createTask({
      userId: state.jobDescription.userId,
      jobDescriptionId: state.jobDescription.id,
      skillId: skill.id,
      platform: state.settings.platform,
      input: state.input,
      currentStep: skill.steps[0]?.id ?? null,
    });
    return { task, currentStepId: skill.steps[0]?.id, traceSteps: [] };
  }

  async function executeStepNode(state: PublishingGraphState): Promise<PublishingGraphUpdate> {
    const skill = requireSkill(state);
    const task = requireTask(state);
    const stepId = state.currentStepId;
    if (!stepId) {
      await dependencies.updateTaskCurrentStep({ taskId: task.id, currentStep: null });
      return { status: 'success', route: 'finalize' };
    }

    const result = await executePublishingStep({
      stepId,
      skill,
      executor: state.executor,
      context: state.context,
    });
    const traceSteps = appendTrace(state, result.traceStep);

    if (result.status === 'running') {
      await dependencies.updateTaskCurrentStep({
        taskId: task.id,
        currentStep: result.nextStepId ?? null,
      });
      return {
        traceSteps,
        currentStepId: result.nextStepId ?? undefined,
        route: 'execute',
      };
    }
    if (result.status === 'success') {
      await dependencies.updateTaskCurrentStep({ taskId: task.id, currentStep: null });
      return {
        traceSteps,
        currentStepId: undefined,
        status: 'success',
        route: 'finalize',
      };
    }
    if (result.status === 'fallback') {
      await dependencies.updateTaskCurrentStep({ taskId: task.id, currentStep: null });
      return {
        traceSteps,
        currentStepId: undefined,
        status: 'failed',
        route: 'fallback',
        onFail: result.onFail,
        failedTraceStep: result.traceStep,
        repairSteps: result.onFail?.repairSteps,
        errorMessage: lastError(result.traceStep, result.onFail?.reason),
      };
    }
    await dependencies.updateTaskCurrentStep({ taskId: task.id, currentStep: null });
    return {
      traceSteps,
      currentStepId: undefined,
      status: 'failed',
      route: 'finalize',
      onFail: result.onFail,
      failedTraceStep: result.traceStep,
      errorMessage: lastError(result.traceStep, result.onFail?.reason),
    };
  }

  async function routeAfterStepNode(): Promise<PublishingGraphUpdate> {
    return {};
  }

  async function fallbackAgentNode(state: PublishingGraphState): Promise<PublishingGraphUpdate> {
    const fallbackTrace = buildFallbackTraceStep(state);
    return {
      traceSteps: appendTrace(state, fallbackTrace),
      route: state.repairSteps?.length ? 'upgrade' : 'finalize',
    };
  }

  async function maybeUpgradeSkillNode(
    state: PublishingGraphState,
  ): Promise<PublishingGraphUpdate> {
    const skill = requireSkill(state);
    if (!state.repairSteps?.length) {
      return { route: 'finalize' };
    }
    const nextSkill = await dependencies.createNextSkillVersion({
      previousSkill: skill,
      steps: state.repairSteps,
      meta: {
        success_rate: 0,
        usage_count: 0,
        created_from: 'agent',
        repaired_from_skill_id: skill.id,
        repaired_from_version: skill.version,
        failed_step_id: state.failedTraceStep?.stepId ?? state.currentStepId ?? '',
        repair_reason: state.onFail?.reason ?? state.errorMessage ?? 'step failed',
      },
    });
    return {
      traceSteps: appendTrace(
        state,
        buildSkillUpgradeTraceStep({ previousSkill: skill, nextSkill }),
      ),
      route: 'finalize',
    };
  }

  async function finalizeNode(state: PublishingGraphState): Promise<PublishingGraphUpdate> {
    const task = requireTask(state);
    const skill = requireSkill(state);
    const status = state.status === 'success' ? 'success' : 'failed';
    await dependencies.completeTask({
      taskId: task.id,
      skillId: skill.id,
      status,
      steps: state.traceSteps,
      errorMessage: status === 'failed' ? (state.errorMessage ?? null) : null,
    });
    return { status, route: 'finalize' };
  }

  return new StateGraph(PublishingState)
    .addNode('prepare', prepareNode)
    .addNode('explore_or_load_skill', exploreOrLoadSkillNode)
    .addNode('create_task', createTaskNode)
    .addNode('execute_step', executeStepNode)
    .addNode('route_after_step', routeAfterStepNode)
    .addNode('fallback_agent', fallbackAgentNode)
    .addNode('maybe_upgrade_skill', maybeUpgradeSkillNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'prepare')
    .addEdge('prepare', 'explore_or_load_skill')
    .addEdge('explore_or_load_skill', 'create_task')
    .addEdge('create_task', 'execute_step')
    .addEdge('execute_step', 'route_after_step')
    .addConditionalEdges('route_after_step', routeAfterStep, {
      execute: 'execute_step',
      fallback: 'fallback_agent',
      finalize: 'finalize',
    })
    .addConditionalEdges('fallback_agent', routeAfterStep, {
      upgrade: 'maybe_upgrade_skill',
      finalize: 'finalize',
    })
    .addEdge('maybe_upgrade_skill', 'finalize')
    .addEdge('finalize', END)
    .compile();
}

function withDefaultDependencies(
  dependencies: PublishingGraphDependencies = {},
): Required<PublishingGraphDependencies> {
  return {
    getActiveSkill: dependencies.getActiveSkill ?? getActivePublishSkillFromDb,
    exploreSkill: dependencies.exploreSkill ?? exploreBossLikePublishSkill,
    createExploredSkill: dependencies.createExploredSkill ?? createExploredPublishSkill,
    createTask: dependencies.createTask ?? createPublishTask,
    updateTaskCurrentStep: dependencies.updateTaskCurrentStep ?? updatePublishTaskCurrentStep,
    completeTask: dependencies.completeTask ?? completePublishTask,
    createNextSkillVersion:
      dependencies.createNextSkillVersion ?? createNextActivePublishSkillVersion,
  };
}

export async function runPublishingAgentGraph(options: {
  jobDescription: JobDescriptionDto;
  settings: PublishJobDescriptionSettings;
  executor: BrowserExecutor;
  target: Record<string, unknown>;
  credentials: Record<string, unknown>;
  dependencies?: PublishingGraphDependencies;
}): Promise<PublishTaskResult> {
  const graph = makeGraph(withDefaultDependencies(options.dependencies));
  const result = await graph.invoke(
    {
      jobDescription: options.jobDescription,
      settings: options.settings,
      executor: options.executor,
      credentials: options.credentials,
      target: options.target,
      input: {},
      context: {
        input: {},
        credentials: options.credentials,
        target: options.target,
      },
      skill: undefined,
      task: undefined,
      currentStepId: undefined,
      traceSteps: [],
      status: 'running',
      route: 'execute',
      onFail: undefined,
      failedTraceStep: undefined,
      repairSteps: undefined,
      errorMessage: undefined,
    },
    { recursionLimit: 200 },
  );

  const task = requireTask(result);
  const skill = requireSkill(result);
  const status = result.status === 'success' ? 'success' : 'failed';
  return {
    taskId: task.id,
    skillId: skill.id,
    status,
    trace: {
      taskId: task.id,
      skillId: skill.id,
      status,
      steps: result.traceSteps,
      createdAt: new Date().toISOString(),
    },
  };
}
