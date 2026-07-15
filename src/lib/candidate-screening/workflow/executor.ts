import type {
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserTargetInput,
  LocatorMatchReport,
  StructuredDomSnapshot,
} from '@/lib/browser/types';
import { runBrowserWorkflow as runSharedBrowserWorkflow } from '@/lib/jd-publishing/skill-executor';
import {
  createExploredPublishSkill,
  createNextActivePublishSkillVersion,
  getActiveBrowserV2SkillByName,
  isBrowserV2Skill,
} from '@/lib/jd-publishing/publish-repo';
import type {
  BrowserWorkflowRunResult,
  PublishExecutionContext,
  PublishSkill,
  PublishSkillMeta,
  PublishStep,
} from '@/lib/jd-publishing/types';
import { getPublishedWorkflowDetail } from '@/lib/workflows/published-workflows';
import {
  createCandidateScreeningRunEvent,
  updateCandidateScreeningRun,
  type CreateRunEventParams,
  type UpdateRunParams,
} from '../repo';
import type {
  ActionExecutionResult,
  CandidateSourceAdapter,
  StoredCandidateRef,
} from '../adapters/types';
import {
  extractBossLikeCandidatesFromHtml,
  mergeBossLikeCandidateWithDetail,
  resolveBossLikeProfileUrl,
} from '../adapters/boss-like';
import type { RawCandidate } from '../ingest';
import type {
  CandidateActionPlan,
  CandidateScreeningPlatform,
  CandidateScreeningRunStage,
  SearchPlan,
} from '../types';
import {
  exploreBossLikeScreeningWorkflow,
  repairBossLikeScreeningSteps,
  repairBossLikeScreeningTargetFromSnapshot,
} from './explore';
import {
  assertCandidateScreeningRepairTargetGrounded,
  runCandidateScreeningWorkflowRepairAgent,
  type CandidateScreeningWorkflowRepairAgentInput,
  type CandidateScreeningWorkflowRepairAgentResult,
} from './llm-repair';
import { isCompatibleBossLikeScreeningSkill } from './skill-registry';
import { SCREENING_STEP_IDS } from './types';
import type {
  BossLikeScreeningExploration,
  BossLikeScreeningTargets,
  ScreeningWorkflowSkill,
} from './types';

type WorkflowRunRepository = {
  updateRun: (params: UpdateRunParams) => ReturnType<typeof updateCandidateScreeningRun>;
  createRunEvent: (
    params: CreateRunEventParams,
  ) => ReturnType<typeof createCandidateScreeningRunEvent>;
};

type ExploredScreeningWorkflow = BossLikeScreeningExploration & ScreeningWorkflowSkill;

type ExploreScreeningWorkflow = (params: {
  adapter: CandidateSourceAdapter;
  searchPlan: SearchPlan;
  baseUrl: string;
  credentials: {
    username: string;
    password: string;
  };
}) => Promise<ExploredScreeningWorkflow | ScreeningWorkflowSkill | null>;

type CreateNextScreeningSkillVersion = (params: {
  previousSkill: PublishSkill;
  steps: PublishStep[];
  meta?: PublishSkillMeta;
}) => Promise<PublishSkill>;

type RepairScreeningWorkflowWithAgent = (
  params: CandidateScreeningWorkflowRepairAgentInput,
) => Promise<CandidateScreeningWorkflowRepairAgentResult>;

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
  getSkillById?: (skillId: string) => Promise<PublishSkill | null>;
  exploreSkill?: ExploreScreeningWorkflow;
  createExploredSkill?: (skill: PublishSkill) => Promise<PublishSkill>;
  createNextSkillVersion?: CreateNextScreeningSkillVersion;
  repairWorkflowWithAgent?: RepairScreeningWorkflowWithAgent;
  runBrowserWorkflow?: typeof runSharedBrowserWorkflow;
  updateRun?: WorkflowRunRepository['updateRun'];
  createRunEvent?: WorkflowRunRepository['createRunEvent'];
};

type ResolvedDependencies = Omit<
  CandidateScreeningWorkflowSessionDependencies,
  | 'repo'
  | 'getActiveSkill'
  | 'getSkillById'
  | 'exploreSkill'
  | 'createExploredSkill'
  | 'createNextSkillVersion'
  | 'repairWorkflowWithAgent'
  | 'runBrowserWorkflow'
  | 'updateRun'
  | 'createRunEvent'
> & {
  getActiveSkill: NonNullable<CandidateScreeningWorkflowSessionDependencies['getActiveSkill']>;
  getSkillById: NonNullable<CandidateScreeningWorkflowSessionDependencies['getSkillById']>;
  exploreSkill: ExploreScreeningWorkflow;
  createExploredSkill: NonNullable<
    CandidateScreeningWorkflowSessionDependencies['createExploredSkill']
  >;
  createNextSkillVersion: CreateNextScreeningSkillVersion;
  repairWorkflowWithAgent: RepairScreeningWorkflowWithAgent;
  runBrowserWorkflow: typeof runSharedBrowserWorkflow;
  updateRun: WorkflowRunRepository['updateRun'];
  createRunEvent: WorkflowRunRepository['createRunEvent'];
};

type WorkflowEventDetail = {
  workflowStep: string;
  skillId: string;
  workflowName?: string;
  workflowVersion?: number;
  reused?: true;
  previousSkillId?: string;
  retry?: true;
  retryState?: 'start' | 'success' | 'failure';
  repair?: true;
  repairStrategy?: 'deterministic' | 'llm';
  agent?: true;
  agentReason?: string;
  browserTrace?: Record<string, unknown>;
  candidateName?: string;
  candidateId?: string;
  target?: BrowserTargetInput;
  targetKey?: string;
  error?: string;
  rawSnapshot?: string;
  structuredSnapshot?: StructuredDomSnapshot;
};

type SegmentParams = {
  startStepId: string;
  input: Record<string, unknown>;
  candidate?: StoredCandidateRef;
  candidateName?: string;
};

type BrowserFailureContext = {
  rawSnapshot?: string;
  structuredSnapshot?: StructuredDomSnapshot;
};

type TargetFailure = {
  stepId: string;
  targetKey: keyof BossLikeScreeningTargets;
  target: BrowserTargetInput;
  error: string;
};

const TARGET_KEY_BY_STEP_ID: Partial<Record<string, keyof BossLikeScreeningTargets>> = {
  [SCREENING_STEP_IDS.loginFillUsername]: 'username',
  [SCREENING_STEP_IDS.loginFillPassword]: 'password',
  [SCREENING_STEP_IDS.loginSubmit]: 'loginButton',
  [SCREENING_STEP_IDS.searchFill]: 'searchInput',
  [SCREENING_STEP_IDS.searchSubmit]: 'searchSubmit',
  [SCREENING_STEP_IDS.contactOpenGreeting]: 'greetButton',
  [SCREENING_STEP_IDS.contactFillMessage]: 'messageInput',
  [SCREENING_STEP_IDS.contactSend]: 'sendButton',
  [SCREENING_STEP_IDS.collectClick]: 'collectButton',
};

const CONTACT_REPAIR_STEP_IDS = new Set<string>([
  SCREENING_STEP_IDS.contactOpenGreeting,
  SCREENING_STEP_IDS.contactFillMessage,
  SCREENING_STEP_IDS.contactSend,
]);

const SEARCH_REPAIR_STEP_IDS = new Set<string>([
  SCREENING_STEP_IDS.searchFill,
  SCREENING_STEP_IDS.searchSubmit,
]);

const TARGET_KIND_BY_KEY: Record<
  keyof BossLikeScreeningTargets,
  Extract<BrowserTargetInput, { kind: string }>['kind']
> = {
  username: 'field',
  password: 'field',
  loginButton: 'button',
  searchInput: 'field',
  searchSubmit: 'button',
  detailContent: 'text',
  greetButton: 'button',
  messageInput: 'field',
  sendButton: 'button',
  collectButton: 'button',
};

export type CandidateScreeningWorkflowSession = {
  readonly skill: ScreeningWorkflowSkill | null;
  loadOrExplore(params: {
    searchPlan: SearchPlan;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill | null>;
  loadExact(params: {
    skillId: string;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill>;
  runSearchKeyword(params: {
    keyword: string;
    maxCandidates: number;
  }): Promise<{ keyword: string; candidates: RawCandidate[] }>;
  observeCandidateProfile(candidate: RawCandidate): Promise<RawCandidate>;
  contactAndCollectCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
  ): Promise<ActionExecutionResult>;
  collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult>;
  close(): Promise<void>;
};

function readBossLikeSetting(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function createBossLikeSearchUrl(baseUrl: string, keyword: string): string {
  const url = new URL('/employer/resumes', `${baseUrl}/`);
  url.searchParams.set('keyword', keyword);
  return url.toString();
}

function resolveWorkflowExploreContext(adapter: CandidateSourceAdapter): {
  baseUrl: string;
  credentials: { username: string; password: string };
} {
  return (
    adapter.getWorkflowExploreContext?.() ?? {
      baseUrl: readBossLikeSetting('BOSS_LIKE_BASE_URL', 'http://localhost:6183'),
      credentials: {
        username: readBossLikeSetting('BOSS_LIKE_EMPLOYER_USERNAME', 'admin'),
        password: readBossLikeSetting('BOSS_LIKE_EMPLOYER_PASSWORD', 'boss123'),
      },
    }
  );
}

function screeningSkill(skill: PublishSkill): ScreeningWorkflowSkill {
  if (skill.name !== 'screen_candidates') {
    throw new Error(`expected screen_candidates workflow, received ${skill.name}`);
  }
  if (!isBrowserV2Skill(skill)) {
    throw new Error('screening workflow must use browser-v2 DSL');
  }
  return skill as ScreeningWorkflowSkill;
}

function isExploredScreeningWorkflow(
  skill: ExploredScreeningWorkflow | ScreeningWorkflowSkill,
): skill is ExploredScreeningWorkflow {
  return 'firstKeyword' in skill && 'firstListHtml' in skill && 'skill' in skill;
}

function isBrowserTargetInput(value: unknown): value is BrowserTargetInput {
  if (typeof value === 'string') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.kind === 'string' && typeof candidate.name === 'string';
}

function targetForStep(skill: ScreeningWorkflowSkill, stepId: string): BrowserTargetInput | null {
  const step = skill.steps.find(
    (candidate): candidate is Extract<PublishStep, { type: 'action' }> =>
      candidate.id === stepId && candidate.type === 'action',
  );
  return isBrowserTargetInput(step?.params.target) ? step.params.target : null;
}

function patchStepTarget(
  currentSkill: ScreeningWorkflowSkill,
  stepId: string,
  target: BrowserTargetInput,
): PublishStep[] | null {
  let patched = false;
  const steps = currentSkill.steps.map((step) => {
    if (step.id !== stepId || step.type !== 'action' || !isBrowserTargetInput(step.params.target)) {
      return step;
    }
    patched = true;
    return { ...step, params: { ...step.params, target } };
  });
  return patched ? steps : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown workflow repair error';
}

function resolveOptionsForTarget(targetKey: keyof BossLikeScreeningTargets): BrowserResolveOptions {
  if (targetKey === 'username' || targetKey === 'password' || targetKey === 'searchInput') {
    return { action: 'fill', requireEditable: true };
  }
  if (targetKey === 'messageInput') return { action: 'fill', requireEditable: true };
  return { action: 'click' };
}

function targetFailureCode(report: LocatorMatchReport): string {
  if (report.status === 'ambiguous') return 'ambiguous_target';
  if (report.status === 'low_confidence') return 'low_confidence_target';
  return 'not_found_target';
}

function errorForWorkflowRun(run: BrowserWorkflowRunResult): string {
  return (
    run.failedStep?.result.error ??
    run.onFail?.reason ??
    `browser workflow ${run.status} at ${run.currentStepId ?? 'terminal'}`
  );
}

function browserTrace(run: BrowserWorkflowRunResult): Record<string, unknown> {
  return {
    status: run.status,
    currentStepId: run.currentStepId,
    traceSteps: run.traceSteps,
  };
}

function contactAndCollectBrowserTrace(run: BrowserWorkflowRunResult): Record<string, unknown> {
  const completed = new Set(
    run.traceSteps.filter((step) => step.result.success).map((step) => step.stepId),
  );
  const contactSucceeded = completed.has(SCREENING_STEP_IDS.contactWaitSuccess);
  const collectSucceeded =
    run.status === 'success' || completed.has(SCREENING_STEP_IDS.collectClick);
  return {
    contact: contactSucceeded ? 'success' : 'failed',
    collect: collectSucceeded ? 'success' : contactSucceeded ? 'failed' : 'not_attempted',
    workflow: browserTrace(run),
  };
}

function normalizeCandidateProfileUrl(candidate: RawCandidate, baseUrl: string): RawCandidate {
  const profileUrl = resolveBossLikeProfileUrl(candidate.profileUrl, baseUrl).profileUrl;
  return profileUrl ? { ...candidate, profileUrl } : candidate;
}

function mergeProfileObservation(params: {
  candidate: RawCandidate;
  html: string;
  baseUrl: string;
}): RawCandidate {
  const detailCandidates = extractBossLikeCandidatesFromHtml(params.html);
  const detail =
    detailCandidates.find(
      (candidate) =>
        candidate.platformCandidateId === params.candidate.platformCandidateId ||
        candidate.profileUrl === params.candidate.profileUrl,
    ) ?? detailCandidates[0];
  const merged = detail
    ? mergeBossLikeCandidateWithDetail(params.candidate, detail)
    : params.candidate;
  return normalizeCandidateProfileUrl(merged, params.baseUrl);
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
    getActiveSkill: dependencies.getActiveSkill ?? getActiveBrowserV2SkillByName,
    getSkillById:
      dependencies.getSkillById ??
      (async (skillId) => {
        const detail = await getPublishedWorkflowDetail(skillId);
        return detail?.workflow ?? null;
      }),
    exploreSkill:
      dependencies.exploreSkill ??
      (async ({ adapter, searchPlan, baseUrl, credentials }) =>
        exploreBossLikeScreeningWorkflow({
          executor: adapter.getBrowserExecutor(),
          baseUrl,
          credentials,
          searchPlan,
        })),
    createExploredSkill: dependencies.createExploredSkill ?? createExploredPublishSkill,
    createNextSkillVersion:
      dependencies.createNextSkillVersion ?? createNextActivePublishSkillVersion,
    repairWorkflowWithAgent:
      dependencies.repairWorkflowWithAgent ?? runCandidateScreeningWorkflowRepairAgent,
    runBrowserWorkflow: dependencies.runBrowserWorkflow ?? runSharedBrowserWorkflow,
    updateRun,
    createRunEvent,
  };
}

export function createCandidateScreeningWorkflowSession(
  input: CandidateScreeningWorkflowSessionDependencies,
): CandidateScreeningWorkflowSession {
  const dependencies = resolveDependencies(input);
  const exploreContext = resolveWorkflowExploreContext(dependencies.adapter);
  let skill: ScreeningWorkflowSkill | null = null;
  let stage: CandidateScreeningRunStage | null = null;
  let firstExploredList: { keyword: string; html: string } | null = null;

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
    level: 'info' | 'success' | 'error';
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

  function eventDetail(params: Omit<WorkflowEventDetail, 'skillId'> & { skillId?: string }) {
    return {
      ...params,
      skillId: params.skillId ?? requireSkill().id,
    };
  }

  function executionContext(inputValues: Record<string, unknown>): PublishExecutionContext {
    return {
      input: {
        baseUrl: exploreContext.baseUrl,
        keyword: '',
        searchUrl: '',
        profileUrl: '',
        message: '',
        ...inputValues,
      },
      credentials: exploreContext.credentials,
      target: {},
    };
  }

  async function clearCurrentWorkflowStep(): Promise<void> {
    await updateRun({ skillId: requireSkill().id, currentWorkflowStep: null });
  }

  async function runSegmentOnce(
    params: SegmentParams,
    retry: boolean,
  ): Promise<BrowserWorkflowRunResult> {
    const currentSkill = requireSkill();
    const run = await dependencies.runBrowserWorkflow({
      skill: currentSkill,
      currentStepId: params.startStepId,
      executor: dependencies.adapter.getBrowserExecutor(),
      context: executionContext(params.input),
      onStep: async ({ stepId }) => {
        await updateRun({ skillId: currentSkill.id, currentWorkflowStep: stepId });
        await recordEvent({
          level: 'info',
          message: retry ? `Workflow 重试步骤：${stepId}` : `Workflow 开始：${stepId}`,
          candidateId: params.candidate?.candidateId,
          detail: eventDetail({
            workflowStep: stepId,
            skillId: currentSkill.id,
            retry: retry || undefined,
            retryState: retry ? 'start' : undefined,
            candidateId: params.candidate?.candidateId,
            candidateName: params.candidate?.displayName ?? params.candidateName,
          }),
        });
      },
    });

    if (run.status === 'success') {
      await clearCurrentWorkflowStep();
      await recordEvent({
        level: 'success',
        message: retry
          ? `Workflow 重试成功：${params.startStepId}`
          : `Workflow 完成：${params.startStepId}`,
        candidateId: params.candidate?.candidateId,
        detail: eventDetail({
          workflowStep: params.startStepId,
          retry: retry || undefined,
          retryState: retry ? 'success' : undefined,
          browserTrace: browserTrace(run),
          candidateId: params.candidate?.candidateId,
          candidateName: params.candidate?.displayName ?? params.candidateName,
        }),
      });
    }
    return run;
  }

  function targetFailureFromRun(run: BrowserWorkflowRunResult): TargetFailure | null {
    const failedStep = run.failedStep;
    if (!failedStep) return null;
    const targetKey = TARGET_KEY_BY_STEP_ID[failedStep.stepId];
    const target = failedStep.params.target;
    if (!targetKey || !isBrowserTargetInput(target)) return null;
    return {
      stepId: failedStep.stepId,
      targetKey,
      target,
      error: failedStep.result.error ?? errorForWorkflowRun(run),
    };
  }

  async function captureBrowserFailure(
    run: BrowserWorkflowRunResult,
  ): Promise<BrowserFailureContext> {
    const executor = dependencies.adapter.getBrowserExecutor();
    const [rawSnapshot, structuredSnapshot] = await Promise.all([
      executor.snapshot ? Promise.resolve(executor.snapshot()).catch(() => undefined) : undefined,
      executor.snapshotStructured
        ? Promise.resolve(executor.snapshotStructured()).catch(() => undefined)
        : undefined,
    ]);
    const resultSnapshot = run.failedStep?.result.domSnapshot;
    return {
      rawSnapshot:
        rawSnapshot ??
        (typeof resultSnapshot === 'string' && resultSnapshot.trim() ? resultSnapshot : undefined),
      structuredSnapshot:
        structuredSnapshot ??
        (typeof resultSnapshot === 'object' && resultSnapshot !== null
          ? resultSnapshot
          : undefined),
    };
  }

  async function recordWorkflowFailure(params: {
    segment: SegmentParams;
    run: BrowserWorkflowRunResult;
    retry: boolean;
    targetFailure: TargetFailure | null;
    context: BrowserFailureContext;
  }): Promise<void> {
    const stepId = params.run.failedStep?.stepId ?? params.segment.startStepId;
    await recordEvent({
      level: 'error',
      message: params.retry ? `Workflow 重试失败：${stepId}` : `Workflow 失败：${stepId}`,
      candidateId: params.segment.candidate?.candidateId,
      detail: eventDetail({
        workflowStep: stepId,
        retry: params.retry || undefined,
        retryState: params.retry ? 'failure' : undefined,
        candidateId: params.segment.candidate?.candidateId,
        candidateName: params.segment.candidate?.displayName ?? params.segment.candidateName,
        target: params.targetFailure?.target,
        targetKey: params.targetFailure?.targetKey,
        error: errorForWorkflowRun(params.run),
        browserTrace: browserTrace(params.run),
        rawSnapshot: params.context.rawSnapshot,
        structuredSnapshot: params.context.structuredSnapshot,
      }),
    });
  }

  async function requireUniqueTarget(
    executor: BrowserExecutor,
    target: BrowserTargetInput,
    targetKey: keyof BossLikeScreeningTargets,
  ): Promise<boolean> {
    if (!executor.resolveTarget) return false;
    const report = await executor.resolveTarget(target, resolveOptionsForTarget(targetKey));
    if (report.status === 'unique') return true;
    throw new Error(`${targetFailureCode(report)}: ${report.reason ?? report.target.name}`);
  }

  async function repairTarget(params: {
    failure: TargetFailure;
    context: BrowserFailureContext;
    candidateId?: string;
    profileUrl?: string;
  }): Promise<boolean> {
    const currentSkill = requireSkill();
    const executor = dependencies.adapter.getBrowserExecutor();
    const snapshot = params.context.structuredSnapshot;
    if (!snapshot || !executor.snapshotStructured || !executor.resolveTarget) return false;

    try {
      const targets: Partial<BossLikeScreeningTargets> = {};
      let targetsValidated = false;

      if (CONTACT_REPAIR_STEP_IDS.has(params.failure.stepId)) {
        let detailSnapshot = snapshot;
        if (params.failure.stepId !== SCREENING_STEP_IDS.contactOpenGreeting) {
          if (!params.profileUrl) return false;
          const navigated = await executor.navigate(params.profileUrl);
          if (!navigated.success) return false;
          detailSnapshot = await executor.snapshotStructured();
        }

        const greetingStepId = SCREENING_STEP_IDS.contactOpenGreeting;
        const greetingTarget = targetForStep(currentSkill, greetingStepId);
        if (!greetingTarget) return false;
        const repairedGreeting = repairBossLikeScreeningTargetFromSnapshot({
          snapshot: detailSnapshot,
          failedStepId: greetingStepId,
          targetKey: 'greetButton',
          failedTarget: greetingTarget,
        });
        if (!repairedGreeting) return false;
        await requireUniqueTarget(executor, repairedGreeting, 'greetButton');
        targets.greetButton = repairedGreeting;

        const opened = await executor.click(repairedGreeting);
        if (!opened.success) return false;
        const composerSnapshot = await executor.snapshotStructured();
        for (const stepId of [
          SCREENING_STEP_IDS.contactFillMessage,
          SCREENING_STEP_IDS.contactSend,
        ]) {
          const targetKey = TARGET_KEY_BY_STEP_ID[stepId];
          const failedTarget = targetForStep(currentSkill, stepId);
          if (!targetKey || !failedTarget) return false;
          const repairedTarget = repairBossLikeScreeningTargetFromSnapshot({
            snapshot: composerSnapshot,
            failedStepId: stepId,
            targetKey,
            failedTarget,
          });
          if (!repairedTarget) return false;
          await requireUniqueTarget(executor, repairedTarget, targetKey);
          targets[targetKey] = repairedTarget;
        }
        targetsValidated = true;
      } else {
        const replacement = repairBossLikeScreeningTargetFromSnapshot({
          snapshot,
          failedStepId: params.failure.stepId,
          targetKey: params.failure.targetKey,
          failedTarget: params.failure.target,
        });
        if (!replacement) return false;
        targets[params.failure.targetKey] = replacement;
      }

      if (!targetsValidated) {
        for (const [targetKey, target] of Object.entries(targets)) {
          if (!target) return false;
          await requireUniqueTarget(executor, target, targetKey as keyof BossLikeScreeningTargets);
        }
      }

      const repairedSteps = repairBossLikeScreeningSteps({
        steps: currentSkill.steps,
        failedStepId: params.failure.stepId,
        targets,
      });
      if (!repairedSteps) return false;

      const nextSkill = screeningSkill(
        await dependencies.createNextSkillVersion({
          previousSkill: currentSkill,
          steps: repairedSteps,
          meta: {
            ...currentSkill.meta,
            repaired_from_skill_id: currentSkill.id,
            repaired_from_version: currentSkill.version,
            failed_step_id: params.failure.stepId,
            repair_reason: params.failure.error,
            repair_strategy: 'deterministic',
          },
        }),
      );
      await updateRun({ skillId: nextSkill.id, currentWorkflowStep: params.failure.stepId });
      await recordEvent({
        level: 'info',
        message: `Workflow 修复并升级到 v${nextSkill.version}`,
        candidateId: params.candidateId,
        detail: eventDetail({
          workflowStep: params.failure.stepId,
          skillId: nextSkill.id,
          previousSkillId: currentSkill.id,
          repair: true,
          repairStrategy: 'deterministic',
        }),
      });
      skill = nextSkill;
      return true;
    } catch {
      return false;
    }
  }

  async function repairTargetWithAgent(params: {
    failure: TargetFailure;
    context: BrowserFailureContext;
    traceSteps: BrowserWorkflowRunResult['traceSteps'];
    candidateId?: string;
  }): Promise<boolean> {
    const currentSkill = requireSkill();
    await recordEvent({
      level: 'info',
      message: `Workflow Fallback Agent 介入：${params.failure.stepId}`,
      candidateId: params.candidateId,
      detail: eventDetail({
        workflowStep: params.failure.stepId,
        target: params.failure.target,
        targetKey: params.failure.targetKey,
        error: params.failure.error,
        repair: true,
        repairStrategy: 'llm',
        agent: true,
        structuredSnapshot: params.context.structuredSnapshot,
      }),
    });

    const snapshot = params.context.structuredSnapshot;
    const executor = dependencies.adapter.getBrowserExecutor();
    if (!snapshot || !executor.resolveTarget) {
      await recordEvent({
        level: 'error',
        message: `Workflow Fallback Agent 修复失败：${params.failure.stepId}`,
        candidateId: params.candidateId,
        detail: eventDetail({
          workflowStep: params.failure.stepId,
          error: 'structured snapshot or target resolver is unavailable',
          repair: true,
          repairStrategy: 'llm',
          agent: true,
        }),
      });
      return false;
    }

    try {
      const repaired = await dependencies.repairWorkflowWithAgent({
        skillId: currentSkill.id,
        workflowVersion: currentSkill.version,
        failedStepId: params.failure.stepId,
        targetKey: params.failure.targetKey,
        failedTarget: params.failure.target,
        error: params.failure.error,
        structuredSnapshot: snapshot,
        traceSteps: params.traceSteps,
      });
      if (repaired.target.kind !== TARGET_KIND_BY_KEY[params.failure.targetKey]) {
        throw new Error(
          `LLM repair changed target kind for ${params.failure.targetKey}: ${repaired.target.kind}`,
        );
      }
      assertCandidateScreeningRepairTargetGrounded({ target: repaired.target, snapshot });
      await requireUniqueTarget(executor, repaired.target, params.failure.targetKey);
      const repairedSteps = patchStepTarget(currentSkill, params.failure.stepId, repaired.target);
      if (!repairedSteps) return false;

      const candidateSkill = { ...currentSkill, steps: repairedSteps };
      if (!isCompatibleBossLikeScreeningSkill(candidateSkill)) {
        throw new Error('LLM repair produced an incompatible screen_candidates workflow');
      }

      const nextSkill = screeningSkill(
        await dependencies.createNextSkillVersion({
          previousSkill: currentSkill,
          steps: repairedSteps,
          meta: {
            ...currentSkill.meta,
            created_from: 'agent',
            repaired_from_skill_id: currentSkill.id,
            repaired_from_version: currentSkill.version,
            failed_step_id: params.failure.stepId,
            repair_reason: repaired.reason,
            repair_strategy: 'llm',
            repair_agent_prompt_id: repaired.promptId,
            repair_agent_prompt_version: repaired.promptVersion,
            repair_agent_provider: repaired.provider,
            repair_agent_model: repaired.model,
          },
        }),
      );
      await updateRun({ skillId: nextSkill.id, currentWorkflowStep: params.failure.stepId });
      await recordEvent({
        level: 'success',
        message: `Workflow Fallback Agent 修复并升级到 v${nextSkill.version}`,
        candidateId: params.candidateId,
        detail: eventDetail({
          workflowStep: params.failure.stepId,
          skillId: nextSkill.id,
          previousSkillId: currentSkill.id,
          repair: true,
          repairStrategy: 'llm',
          agent: true,
          agentReason: repaired.reason,
          target: repaired.target,
          targetKey: params.failure.targetKey,
        }),
      });
      skill = nextSkill;
      return true;
    } catch (error) {
      await recordEvent({
        level: 'error',
        message: `Workflow Fallback Agent 修复失败：${params.failure.stepId}`,
        candidateId: params.candidateId,
        detail: eventDetail({
          workflowStep: params.failure.stepId,
          error: errorMessage(error),
          repair: true,
          repairStrategy: 'llm',
          agent: true,
        }),
      });
      return false;
    }
  }

  async function runSegmentWithSingleRepair(
    params: SegmentParams,
  ): Promise<BrowserWorkflowRunResult> {
    let retry = false;
    let startStepId = params.startStepId;
    let previousTraceSteps: BrowserWorkflowRunResult['traceSteps'] = [];
    let previousObservations: BrowserWorkflowRunResult['observations'] = {};

    while (true) {
      const run = await runSegmentOnce({ ...params, startStepId }, retry);
      const combinedRun: BrowserWorkflowRunResult = {
        ...run,
        traceSteps: [...previousTraceSteps, ...run.traceSteps],
        observations: { ...previousObservations, ...run.observations },
      };
      if (run.status === 'success') return combinedRun;

      const targetFailure = targetFailureFromRun(run);
      const context = await captureBrowserFailure(run);
      await recordWorkflowFailure({
        segment: { ...params, startStepId },
        run: combinedRun,
        retry,
        targetFailure,
        context,
      });
      if (retry || !targetFailure) {
        await clearCurrentWorkflowStep();
        return combinedRun;
      }
      let repaired = await repairTarget({
        failure: targetFailure,
        context,
        candidateId: params.candidate?.candidateId,
        profileUrl:
          typeof params.input.profileUrl === 'string' ? params.input.profileUrl : undefined,
      });
      if (!repaired) {
        repaired = await repairTargetWithAgent({
          failure: targetFailure,
          context,
          traceSteps: combinedRun.traceSteps,
          candidateId: params.candidate?.candidateId,
        });
      }
      if (!repaired) {
        await clearCurrentWorkflowStep();
        return combinedRun;
      }

      previousTraceSteps = combinedRun.traceSteps;
      previousObservations = combinedRun.observations;
      retry = true;
      startStepId = CONTACT_REPAIR_STEP_IDS.has(targetFailure.stepId)
        ? SCREENING_STEP_IDS.contactOpen
        : SEARCH_REPAIR_STEP_IDS.has(targetFailure.stepId)
          ? SCREENING_STEP_IDS.searchFill
          : targetFailure.stepId;
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
    const activeSkill = active ? screeningSkill(active) : null;
    if (activeSkill && isCompatibleBossLikeScreeningSkill(activeSkill)) {
      skill = activeSkill;
      await recordEvent({
        level: 'info',
        message: `复用 Workflow：${skill.name} v${skill.version} (${skill.id})`,
        detail: eventDetail({
          workflowStep: 'reuse_workflow',
          skillId: skill.id,
          workflowName: skill.name,
          workflowVersion: skill.version,
          reused: true,
        }),
      });
    } else {
      if (activeSkill) {
        await recordEvent({
          level: 'info',
          message: `Workflow 版本不兼容，重新探索：${activeSkill.name} v${activeSkill.version} (${activeSkill.id})`,
          detail: {
            workflowStep: 'replace_incompatible_workflow',
            skillId: activeSkill.id,
            workflowName: activeSkill.name,
            workflowVersion: activeSkill.version,
            previousSkillId: activeSkill.id,
          },
        });
      }
      const explored = await dependencies.exploreSkill({
        adapter: dependencies.adapter,
        searchPlan: params.searchPlan,
        ...exploreContext,
      });
      if (!explored) {
        return null;
      }
      const exploredSkill = isExploredScreeningWorkflow(explored) ? explored.skill : explored;
      skill = screeningSkill(await dependencies.createExploredSkill(exploredSkill));
      if (isExploredScreeningWorkflow(explored)) {
        firstExploredList = { keyword: explored.firstKeyword, html: explored.firstListHtml };
      }
      await recordEvent({
        level: 'success',
        message: 'Workflow 探索完成',
        detail: eventDetail({ workflowStep: 'explore_workflow', skillId: skill.id }),
      });
    }

    await updateRun({ skillId: skill.id, currentWorkflowStep: null });
    return skill;
  }

  async function loadExact(params: {
    skillId: string;
    stage: CandidateScreeningRunStage;
  }): Promise<ScreeningWorkflowSkill> {
    stage = params.stage;
    if (skill) {
      if (skill.id !== params.skillId) {
        throw new Error(
          `screening workflow session already loaded ${skill.id}, cannot load ${params.skillId}`,
        );
      }
      return skill;
    }

    const storedSkill = await dependencies.getSkillById(params.skillId);
    if (!storedSkill) throw new Error(`screening workflow skill not found: ${params.skillId}`);
    skill = screeningSkill(storedSkill);
    if (skill.platform !== dependencies.platform) {
      throw new Error(
        `screening workflow skill platform mismatch: expected ${dependencies.platform}, received ${skill.platform}`,
      );
    }
    await updateRun({ skillId: skill.id, currentWorkflowStep: null });
    return skill;
  }

  async function runSearchKeyword(params: {
    keyword: string;
    maxCandidates: number;
  }): Promise<{ keyword: string; candidates: RawCandidate[] }> {
    const keyword = params.keyword.trim();
    if (!keyword) return { keyword, candidates: [] };
    const currentSkill = requireSkill();
    let html: string;
    if (firstExploredList?.keyword === keyword) {
      html = firstExploredList.html;
      firstExploredList = null;
      await recordEvent({
        level: 'success',
        message: `复用探索搜索观察：${keyword}`,
        detail: eventDetail({
          workflowStep: SCREENING_STEP_IDS.searchObserve,
          skillId: currentSkill.id,
        }),
      });
    } else {
      const run = await runSegmentWithSingleRepair({
        startStepId: SCREENING_STEP_IDS.searchOpen,
        input: {
          keyword,
          searchUrl: createBossLikeSearchUrl(exploreContext.baseUrl, keyword),
        },
      });
      if (run.status !== 'success') throw new Error(errorForWorkflowRun(run));
      html = run.observations.listHtml ?? '';
    }
    if (!html.trim()) throw new Error('screening search did not observe listHtml');
    return {
      keyword,
      candidates: extractBossLikeCandidatesFromHtml(html)
        .map((candidate) => normalizeCandidateProfileUrl(candidate, exploreContext.baseUrl))
        .slice(0, Math.max(0, params.maxCandidates)),
    };
  }

  async function observeCandidateProfile(candidate: RawCandidate): Promise<RawCandidate> {
    const profileUrl = resolveBossLikeProfileUrl(
      candidate.profileUrl,
      exploreContext.baseUrl,
    ).profileUrl;
    if (!profileUrl) return candidate;
    const run = await runSegmentWithSingleRepair({
      startStepId: SCREENING_STEP_IDS.detailOpen,
      input: { profileUrl },
      candidateName: candidate.name,
    });
    if (run.status !== 'success') throw new Error(errorForWorkflowRun(run));
    const html = run.observations.profileHtml ?? '';
    if (!html.trim()) throw new Error('screening profile did not observe profileHtml');
    return mergeProfileObservation({ candidate, html, baseUrl: exploreContext.baseUrl });
  }

  async function contactAndCollectCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
  ): Promise<ActionExecutionResult> {
    const profileUrl = resolveBossLikeProfileUrl(candidate.profileUrl, exploreContext.baseUrl);
    const message = plan.message?.trim();
    if (!profileUrl.profileUrl || !message) {
      return {
        success: false,
        error: profileUrl.error ?? 'chat message is required',
        browserTrace: { action: 'contact_and_collect', candidateId: candidate.candidateId },
      };
    }
    const run = await runSegmentWithSingleRepair({
      startStepId: SCREENING_STEP_IDS.contactOpen,
      input: { profileUrl: profileUrl.profileUrl, message },
      candidate,
    });
    return run.status === 'success'
      ? { success: true, browserTrace: contactAndCollectBrowserTrace(run) }
      : {
          success: false,
          error: errorForWorkflowRun(run),
          browserTrace: contactAndCollectBrowserTrace(run),
        };
  }

  async function collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult> {
    const profileUrl = resolveBossLikeProfileUrl(candidate.profileUrl, exploreContext.baseUrl);
    if (!profileUrl.profileUrl) {
      return {
        success: false,
        error: profileUrl.error ?? 'candidate profileUrl is required to collect',
        browserTrace: { action: 'collect', candidateId: candidate.candidateId },
      };
    }
    const run = await runSegmentWithSingleRepair({
      startStepId: SCREENING_STEP_IDS.collectOpen,
      input: { profileUrl: profileUrl.profileUrl },
      candidate,
    });
    return run.status === 'success'
      ? { success: true, browserTrace: browserTrace(run) }
      : { success: false, error: errorForWorkflowRun(run), browserTrace: browserTrace(run) };
  }

  return {
    get skill() {
      return skill;
    },
    loadOrExplore,
    loadExact,
    runSearchKeyword,
    observeCandidateProfile,
    contactAndCollectCandidate,
    collectCandidate,
    close: () => dependencies.adapter.close(),
  };
}
