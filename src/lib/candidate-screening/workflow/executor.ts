import type {
  BrowserResolveOptions,
  BrowserStepResult,
  BrowserTargetInput,
  LocatorMatchReport,
} from '@/lib/browser/types';
import {
  createExploredPublishSkill,
  createNextActivePublishSkillVersion,
  getActivePublishSkillByName,
} from '@/lib/jd-publishing/publish-repo';
import type { PublishSkill, PublishSkillMeta, PublishStep } from '@/lib/jd-publishing/types';
import {
  createCandidateScreeningRunEvent,
  updateCandidateScreeningRun,
  type CreateRunEventParams,
  type UpdateRunParams,
} from '../repo';
import type {
  ActionExecutionResult,
  CandidateBrowserActionOptions,
  CandidateSourceAdapter,
  RawCandidateBatch,
  SearchOptions,
  StoredCandidateRef,
} from '../adapters/types';
import { CandidateAdapterTargetError } from '../adapters/types';
import { hasShortResumeText } from '../adapters/boss-like';
import type { RawCandidate } from '../ingest';
import type {
  CandidateActionPlan,
  CandidateScreeningPlatform,
  CandidateScreeningRunStage,
  SearchPlan,
} from '../types';
import {
  exploreBossLikeScreeningWorkflow,
  repairBossLikeScreeningTargetFromSnapshot,
} from './explore';
import type { BossLikeScreeningTargets, ScreeningWorkflowSkill } from './types';

type ScreeningWorkflowAction =
  | 'ensure_login'
  | 'search_candidates'
  | 'enrich_candidate'
  | 'chat_candidate'
  | 'collect_candidate';

type WorkflowRunRepository = {
  updateRun: (params: UpdateRunParams) => ReturnType<typeof updateCandidateScreeningRun>;
  createRunEvent: (
    params: CreateRunEventParams,
  ) => ReturnType<typeof createCandidateScreeningRunEvent>;
};

type ExploreScreeningWorkflow = (params: {
  adapter: CandidateSourceAdapter;
  searchPlan: SearchPlan;
}) => Promise<ScreeningWorkflowSkill>;

type CreateNextScreeningSkillVersion = (params: {
  previousSkill: PublishSkill;
  steps: PublishStep[];
  meta?: PublishSkillMeta;
}) => Promise<PublishSkill>;

export type CandidateScreeningWorkflowSessionDependencies = {
  adapter: CandidateSourceAdapter;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  platform: CandidateScreeningPlatform;
  repo?: Partial<WorkflowRunRepository>;
  getActiveSkill?: (params: {
    name: string;
    platform: CandidateScreeningPlatform;
  }) => Promise<PublishSkill | null>;
  exploreSkill?: ExploreScreeningWorkflow;
  createExploredSkill?: (skill: PublishSkill) => Promise<PublishSkill>;
  createNextSkillVersion?: CreateNextScreeningSkillVersion;
  updateRun?: WorkflowRunRepository['updateRun'];
  createRunEvent?: WorkflowRunRepository['createRunEvent'];
};

type ResolvedDependencies = Omit<
  CandidateScreeningWorkflowSessionDependencies,
  | 'repo'
  | 'getActiveSkill'
  | 'exploreSkill'
  | 'createExploredSkill'
  | 'createNextSkillVersion'
  | 'updateRun'
  | 'createRunEvent'
> & {
  getActiveSkill: NonNullable<CandidateScreeningWorkflowSessionDependencies['getActiveSkill']>;
  exploreSkill: ExploreScreeningWorkflow;
  createExploredSkill: NonNullable<
    CandidateScreeningWorkflowSessionDependencies['createExploredSkill']
  >;
  createNextSkillVersion: CreateNextScreeningSkillVersion;
  updateRun: WorkflowRunRepository['updateRun'];
  createRunEvent: WorkflowRunRepository['createRunEvent'];
};

type WorkflowEventDetail = {
  workflowStep: string;
  skillId: string;
  previousSkillId?: string;
  retry?: true;
  repair?: true;
  browserTrace?: Record<string, unknown>;
  candidateName?: string;
};

type ActionStart = {
  skill: ScreeningWorkflowSkill;
  step: Extract<PublishStep, { type: 'action' }>;
};

export class ScreeningWorkflowTargetError extends Error {
  readonly stepId: string;
  readonly targetKey: string;
  readonly target: BrowserTargetInput;
  readonly result: BrowserStepResult;
  readonly browserStepResult: BrowserStepResult;
  readonly candidateId?: string;

  constructor(params: {
    stepId: string;
    targetKey: string;
    target: BrowserTargetInput;
    result: BrowserStepResult;
    candidateId?: string;
  }) {
    super(params.result.error ?? `target failed: ${params.targetKey}`);
    this.name = 'ScreeningWorkflowTargetError';
    this.stepId = params.stepId;
    this.targetKey = params.targetKey;
    this.target = params.target;
    this.result = params.result;
    this.browserStepResult = params.result;
    this.candidateId = params.candidateId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CandidateScreeningWorkflowSession = {
  readonly skill: ScreeningWorkflowSkill | null;
  loadOrExplore(params: {
    searchPlan: SearchPlan;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill | null>;
  searchCandidates(plan: SearchPlan, options: SearchOptions): AsyncIterable<RawCandidateBatch>;
  enrichCandidate(candidate: RawCandidate): Promise<RawCandidate>;
  chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
  ): Promise<ActionExecutionResult>;
  collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult>;
  close(): Promise<void>;
};

function readBossLikeSetting(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function screeningSkill(skill: PublishSkill): ScreeningWorkflowSkill {
  if (skill.name !== 'screen_candidates') {
    throw new Error(`expected screen_candidates workflow, received ${skill.name}`);
  }
  return skill as ScreeningWorkflowSkill;
}

function actionStep(
  skill: ScreeningWorkflowSkill,
  action: ScreeningWorkflowAction,
): Extract<PublishStep, { type: 'action' }> {
  const step = skill.steps.find(
    (candidate): candidate is Extract<PublishStep, { type: 'action' }> =>
      candidate.type === 'action' && candidate.id === action && candidate.action === action,
  );
  if (!step) {
    throw new Error(`screening workflow action is missing: ${action}`);
  }
  return step;
}

function targetsForStep(
  step: Extract<PublishStep, { type: 'action' }>,
): CandidateBrowserActionOptions {
  const targets = step.params.targets;
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new Error(`screening workflow targets are missing: ${step.id}`);
  }
  return { targets: targets as Partial<BossLikeScreeningTargets> };
}

function targetErrorFromUnknown(params: {
  error: unknown;
  step: Extract<PublishStep, { type: 'action' }>;
  candidateId?: string;
}): ScreeningWorkflowTargetError | null {
  if (params.error instanceof ScreeningWorkflowTargetError) return params.error;
  if (!(params.error instanceof CandidateAdapterTargetError)) return null;
  const targets = targetsForStep(params.step).targets;
  if (!targets || !Object.hasOwn(targets, params.error.targetKey)) return null;

  return new ScreeningWorkflowTargetError({
    stepId: params.step.id,
    targetKey: params.error.targetKey,
    target: params.error.target,
    result: params.error.result,
    candidateId: params.candidateId,
  });
}

function resolveOptionsForTarget(targetKey: string): BrowserResolveOptions {
  if (
    targetKey === 'username' ||
    targetKey === 'password' ||
    targetKey === 'searchInput' ||
    targetKey === 'messageInput'
  ) {
    return { action: 'fill', requireEditable: true };
  }
  if (targetKey === 'detailContent') return { action: 'wait_for_text' };
  return { action: 'click' };
}

function targetFailureCode(report: LocatorMatchReport): string {
  if (report.status === 'ambiguous') return 'ambiguous_target';
  if (report.status === 'low_confidence') return 'low_confidence_target';
  return 'not_found_target';
}

class ScreeningWorkflowRepairResolutionError extends Error {
  constructor(report: LocatorMatchReport) {
    super(`${targetFailureCode(report)}: ${report.reason ?? report.target.name}`);
    this.name = 'ScreeningWorkflowRepairResolutionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class ScreeningWorkflowRepairPersistenceError extends Error {
  constructor(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    super(`screening_workflow_repair_persistence_failed: ${message}`);
    this.name = 'ScreeningWorkflowRepairPersistenceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function patchStepTarget(params: {
  steps: PublishStep[];
  stepId: string;
  targetKey: string;
  target: BrowserTargetInput;
}): PublishStep[] {
  return params.steps.map((step) => {
    if (step.id !== params.stepId || step.type !== 'action') return step;
    const targets = step.params.targets;
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) return step;
    return {
      ...step,
      params: {
        ...step.params,
        targets: {
          ...targets,
          [params.targetKey]: params.target,
        },
      },
    };
  });
}

function isActionExecutionResult(value: unknown): value is ActionExecutionResult {
  return typeof value === 'object' && value !== null && 'success' in value;
}

function resolveDependencies(
  dependencies: CandidateScreeningWorkflowSessionDependencies,
): ResolvedDependencies {
  const updateRun =
    dependencies.updateRun ?? dependencies.repo?.updateRun ?? updateCandidateScreeningRun;
  const createRunEvent =
    dependencies.createRunEvent ??
    dependencies.repo?.createRunEvent ??
    createCandidateScreeningRunEvent;
  return {
    ...dependencies,
    getActiveSkill: dependencies.getActiveSkill ?? getActivePublishSkillByName,
    exploreSkill:
      dependencies.exploreSkill ??
      (async ({ adapter, searchPlan }) =>
        exploreBossLikeScreeningWorkflow({
          executor: adapter.getBrowserExecutor(),
          baseUrl: readBossLikeSetting('BOSS_LIKE_BASE_URL', 'http://localhost:6183'),
          credentials: {
            username: readBossLikeSetting('BOSS_LIKE_EMPLOYER_USERNAME', 'admin'),
            password: readBossLikeSetting('BOSS_LIKE_EMPLOYER_PASSWORD', 'boss123'),
          },
          searchPlan,
        })),
    createExploredSkill: dependencies.createExploredSkill ?? createExploredPublishSkill,
    createNextSkillVersion:
      dependencies.createNextSkillVersion ?? createNextActivePublishSkillVersion,
    updateRun,
    createRunEvent,
  };
}

export function createCandidateScreeningWorkflowSession(
  input: CandidateScreeningWorkflowSessionDependencies,
): CandidateScreeningWorkflowSession {
  const dependencies = resolveDependencies(input);
  let skill: ScreeningWorkflowSkill | null = null;
  let stage: CandidateScreeningRunStage | null = null;

  function requireSkill(): ScreeningWorkflowSkill {
    if (!skill) throw new Error('screening workflow must be loaded before browser actions');
    return skill;
  }

  function requireStage(): CandidateScreeningRunStage {
    if (!stage) throw new Error('screening workflow stage must be set before browser actions');
    return stage;
  }

  async function updateRun(params: Pick<UpdateRunParams, 'skillId' | 'currentWorkflowStep'>) {
    await dependencies.updateRun({
      userId: dependencies.userId,
      runId: dependencies.runId,
      jobDescriptionId: dependencies.jobDescriptionId,
      ...params,
    });
  }

  async function recordEvent(params: {
    level: 'info' | 'success';
    message: string;
    detail: WorkflowEventDetail;
    candidateId?: string;
  }): Promise<void> {
    await dependencies.createRunEvent({
      userId: dependencies.userId,
      runId: dependencies.runId,
      jobDescriptionId: dependencies.jobDescriptionId,
      candidateId: params.candidateId ?? null,
      stage: requireStage(),
      level: params.level,
      message: params.message,
      detail: params.detail,
    });
  }

  function eventDetail(params: {
    workflowStep: string;
    skillId?: string;
    previousSkillId?: string;
    retry?: boolean;
    repair?: boolean;
    browserTrace?: Record<string, unknown>;
    candidateName?: string;
  }): WorkflowEventDetail {
    return {
      workflowStep: params.workflowStep,
      skillId: params.skillId ?? requireSkill().id,
      ...(params.previousSkillId ? { previousSkillId: params.previousSkillId } : {}),
      ...(params.retry ? { retry: true } : {}),
      ...(params.repair ? { repair: true } : {}),
      ...(params.browserTrace ? { browserTrace: params.browserTrace } : {}),
      ...(params.candidateName ? { candidateName: params.candidateName } : {}),
    };
  }

  async function startAction(
    action: ScreeningWorkflowAction,
    retry: boolean,
  ): Promise<ActionStart> {
    const currentSkill = requireSkill();
    const step = actionStep(currentSkill, action);
    await updateRun({ skillId: currentSkill.id, currentWorkflowStep: step.id });
    await recordEvent({
      level: 'info',
      message: retry ? `Workflow 重试：${step.id}` : `Workflow 开始：${step.id}`,
      detail: eventDetail({ workflowStep: step.id, skillId: currentSkill.id, retry }),
    });
    return { skill: currentSkill, step };
  }

  async function finishAction(params: {
    stepId: string;
    retry: boolean;
    candidateId?: string;
    candidateName?: string;
    browserTrace?: Record<string, unknown>;
  }): Promise<void> {
    const currentSkill = requireSkill();
    await updateRun({ skillId: currentSkill.id, currentWorkflowStep: null });
    await recordEvent({
      level: 'success',
      message: params.retry
        ? `Workflow 重试成功：${params.stepId}`
        : `Workflow 完成：${params.stepId}`,
      candidateId: params.candidateId,
      detail: eventDetail({
        workflowStep: params.stepId,
        skillId: currentSkill.id,
        retry: params.retry,
        browserTrace: params.browserTrace,
        candidateName: params.candidateName,
      }),
    });
  }

  async function repairTarget(failed: ScreeningWorkflowTargetError): Promise<boolean> {
    const currentSkill = requireSkill();
    const executor = dependencies.adapter.getBrowserExecutor();
    if (!executor.snapshotStructured || !executor.resolveTarget) return false;

    let report: LocatorMatchReport | null = null;
    try {
      const snapshot = await executor.snapshotStructured();
      const replacement = repairBossLikeScreeningTargetFromSnapshot({
        snapshot,
        failedStepId: failed.stepId,
        targetKey: failed.targetKey,
        failedTarget: failed.target,
      });
      if (!replacement) return false;
      report = await executor.resolveTarget(replacement, resolveOptionsForTarget(failed.targetKey));
      if (report.status !== 'unique') {
        throw new ScreeningWorkflowRepairResolutionError(report);
      }
    } catch (error) {
      if (error instanceof ScreeningWorkflowRepairResolutionError) throw error;
      return false;
    }

    if (!report) return false;

    let nextSkill: ScreeningWorkflowSkill;
    try {
      nextSkill = screeningSkill(
        await dependencies.createNextSkillVersion({
          previousSkill: currentSkill,
          steps: patchStepTarget({
            steps: currentSkill.steps,
            stepId: failed.stepId,
            targetKey: failed.targetKey,
            target: report.target,
          }),
          meta: {
            ...currentSkill.meta,
            repaired_from_skill_id: currentSkill.id,
            repaired_from_version: currentSkill.version,
            failed_step_id: failed.stepId,
            repair_reason: failed.message,
          },
        }),
      );
    } catch (error) {
      throw new ScreeningWorkflowRepairPersistenceError(error);
    }

    try {
      await updateRun({ skillId: nextSkill.id, currentWorkflowStep: failed.stepId });
      await recordEvent({
        level: 'info',
        message: `Workflow 修复并升级到 v${nextSkill.version}`,
        candidateId: failed.candidateId,
        detail: eventDetail({
          workflowStep: failed.stepId,
          skillId: nextSkill.id,
          previousSkillId: currentSkill.id,
          repair: true,
        }),
      });
    } catch (error) {
      throw new ScreeningWorkflowRepairPersistenceError(error);
    }

    skill = nextSkill;
    return true;
  }

  async function runAction<T>(params: {
    action: Exclude<ScreeningWorkflowAction, 'search_candidates'>;
    candidateId?: string;
    candidateName?: string;
    invoke: (options: CandidateBrowserActionOptions) => Promise<T>;
  }): Promise<T> {
    let retry = false;

    while (true) {
      const started = await startAction(params.action, retry);
      let value: T;
      try {
        value = await params.invoke(targetsForStep(started.step));
      } catch (error) {
        if (retry) throw error;
        const targetError = targetErrorFromUnknown({
          error,
          step: started.step,
          candidateId: params.candidateId,
        });
        if (!targetError || !(await repairTarget(targetError))) throw error;
        retry = true;
        continue;
      }

      const actionResult = isActionExecutionResult(value) ? value : undefined;
      if (actionResult && !actionResult.success) {
        if (retry || !actionResult.targetError) return value;
        const targetError = targetErrorFromUnknown({
          error: actionResult.targetError,
          step: started.step,
          candidateId: params.candidateId,
        });
        if (!targetError) return value;
        try {
          if (!(await repairTarget(targetError))) return value;
        } catch (error) {
          if (error instanceof ScreeningWorkflowRepairResolutionError) return value;
          throw error;
        }
        retry = true;
        continue;
      }

      await finishAction({
        stepId: started.step.id,
        retry,
        candidateId: params.candidateId,
        candidateName: params.candidateName,
        browserTrace: actionResult?.browserTrace,
      });
      return value;
    }
  }

  async function enrichCandidate(candidate: RawCandidate): Promise<RawCandidate> {
    return runAction({
      action: 'enrich_candidate',
      candidateName: candidate.name,
      invoke: (workflow) => dependencies.adapter.enrichCandidate(candidate, workflow),
    });
  }

  async function* runSearchCandidates(
    plan: SearchPlan,
    options: SearchOptions,
  ): AsyncIterable<RawCandidateBatch> {
    if (!skill) {
      await loadOrExplore({ searchPlan: plan, stage: stage ?? 'searching_live' });
    }
    let retry = false;

    while (true) {
      const started = await startAction('search_candidates', retry);
      try {
        const source = dependencies.adapter.searchCandidates(
          plan,
          { ...options, deferEnrichment: true },
          targetsForStep(started.step),
        );
        for await (const batch of source) {
          const candidates: RawCandidate[] = [];
          for (const candidate of batch.candidates) {
            candidates.push(
              hasShortResumeText(candidate) ? await enrichCandidate(candidate) : candidate,
            );
          }
          yield { ...batch, candidates };
        }
        await finishAction({ stepId: started.step.id, retry });
        return;
      } catch (error) {
        if (retry) throw error;
        const targetError = targetErrorFromUnknown({ error, step: started.step });
        if (!targetError || !(await repairTarget(targetError))) throw error;
        retry = true;
      }
    }
  }

  async function loadOrExplore(params: {
    searchPlan: SearchPlan;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill | null> {
    stage = params.stage;
    if (skill) return skill;

    const active = await dependencies.getActiveSkill({
      name: 'screen_candidates',
      platform: dependencies.platform,
    });
    if (active) {
      skill = screeningSkill(active);
    } else {
      const explored = await dependencies.exploreSkill({
        adapter: dependencies.adapter,
        searchPlan: params.searchPlan,
      });
      skill = screeningSkill(await dependencies.createExploredSkill(explored));
      await recordEvent({
        level: 'success',
        message: 'Workflow 探索完成',
        detail: eventDetail({ workflowStep: 'explore_workflow', skillId: skill.id }),
      });
    }

    await updateRun({ skillId: skill.id, currentWorkflowStep: null });
    await runAction({
      action: 'ensure_login',
      invoke: (workflow) => dependencies.adapter.loginIfNeeded(workflow),
    });
    return skill;
  }

  return {
    get skill() {
      return skill;
    },
    loadOrExplore,
    searchCandidates: runSearchCandidates,
    enrichCandidate,
    chatCandidate: (candidate, plan) =>
      runAction({
        action: 'chat_candidate',
        candidateId: candidate.candidateId,
        candidateName: candidate.displayName,
        invoke: (workflow) => dependencies.adapter.chatCandidate(candidate, plan, workflow),
      }),
    collectCandidate: (candidate) =>
      runAction({
        action: 'collect_candidate',
        candidateId: candidate.candidateId,
        candidateName: candidate.displayName,
        invoke: (workflow) => dependencies.adapter.collectCandidate(candidate, workflow),
      }),
    close: () => dependencies.adapter.close(),
  };
}
