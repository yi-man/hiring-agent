import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createActionIdempotencyKey, createDryRunActionPlan } from './actions';
import { createCandidateSourceAdapter } from './adapters/factory';
import type { CandidateSourceAdapter, StoredCandidateRef } from './adapters/types';
import { createInMemoryDedupeState } from './dedupe';
import { evaluateCandidateForJd } from './evaluation';
import { ingestRawCandidate, type RawCandidate } from './ingest';
import { buildScreeningPlanFromJd } from './planner';
import { mergeAndRankCandidates, type RankInput, type RankedCandidate } from './ranking';
import { recallCandidatesForJd } from './recall';
import {
  claimCandidateActionLog,
  createCandidateActionLog,
  getCandidateScreeningDetail,
  getCandidateScreeningRun,
  listCandidateScreeningResults,
  updateCandidateActionLog,
  updateCandidateScreeningRun,
  upsertCandidateWithIdentity,
  upsertCandidateScreeningResult,
  type CandidateActionLogDto,
  type CandidateScreeningDetailDto,
  type CandidateScreeningResultListItem,
} from './repo';
import type {
  CandidateActionPlan,
  CandidateDecisionAction,
  CreateScreeningRunRequest,
  EvaluationSchema,
  ExecuteActionsRequest,
  ScreeningRunStats,
  SearchPlan,
} from './types';
import type { JobDescriptionDto } from '@/types';

type CandidateContext = {
  candidateId: string;
  resumeId: string | null;
  resumeText: string;
  displayName: string;
  profileUrl: string | null;
};

type CandidateEvaluation = Awaited<ReturnType<typeof evaluateCandidateForJd>>;
type CandidateScreeningGraphRoute = 'execute_actions' | 'finalize';

export type ScreeningRunnerDependencies = {
  buildPlan: typeof buildScreeningPlanFromJd;
  createAdapter: typeof createCandidateSourceAdapter;
  ingestCandidate: typeof ingestRawCandidate;
  recallCandidates: typeof recallCandidatesForJd;
  evaluateCandidate: typeof evaluateCandidateForJd;
  mergeAndRank: typeof mergeAndRankCandidates;
  repo: {
    getRun: typeof getCandidateScreeningRun;
    updateRun: typeof updateCandidateScreeningRun;
    upsertResult: typeof upsertCandidateScreeningResult;
    createActionLog: typeof createCandidateActionLog;
    updateActionLog: typeof updateCandidateActionLog;
    listResults: typeof listCandidateScreeningResults;
    getDetail: typeof getCandidateScreeningDetail;
    upsertCandidate: typeof upsertCandidateWithIdentity;
    claimActionLog: typeof claimCandidateActionLog;
  };
};

type ScreeningRunnerDependencyOverrides = Partial<Omit<ScreeningRunnerDependencies, 'repo'>> & {
  repo?: Partial<ScreeningRunnerDependencies['repo']>;
};

const defaultDependencies: ScreeningRunnerDependencies = {
  buildPlan: buildScreeningPlanFromJd,
  createAdapter: createCandidateSourceAdapter,
  ingestCandidate: ingestRawCandidate,
  recallCandidates: recallCandidatesForJd,
  evaluateCandidate: evaluateCandidateForJd,
  mergeAndRank: mergeAndRankCandidates,
  repo: {
    getRun: getCandidateScreeningRun,
    updateRun: updateCandidateScreeningRun,
    upsertResult: upsertCandidateScreeningResult,
    createActionLog: createCandidateActionLog,
    updateActionLog: updateCandidateActionLog,
    listResults: listCandidateScreeningResults,
    getDetail: getCandidateScreeningDetail,
    upsertCandidate: upsertCandidateWithIdentity,
    claimActionLog: claimCandidateActionLog,
  },
};

const CandidateScreeningState = Annotation.Root({
  runId: Annotation<string>(),
  userId: Annotation<string>(),
  jobDescription: Annotation<JobDescriptionDto>(),
  request: Annotation<CreateScreeningRunRequest>(),
  dependencies: Annotation<ScreeningRunnerDependencies>(),
  stats: Annotation<ScreeningRunStats>(),
  searchPlan: Annotation<SearchPlan | undefined>(),
  evaluationSchema: Annotation<EvaluationSchema | undefined>(),
  rawCandidates: Annotation<RawCandidate[]>(),
  contexts: Annotation<Map<string, CandidateContext>>(),
  liveInputs: Annotation<RankInput[]>(),
  vectorInputs: Annotation<RankInput[]>(),
  evaluations: Annotation<Map<string, CandidateEvaluation>>(),
  rankedCandidates: Annotation<RankedCandidate[]>(),
  route: Annotation<CandidateScreeningGraphRoute>(),
});

type CandidateScreeningGraphState = typeof CandidateScreeningState.State;
type CandidateScreeningGraphUpdate = typeof CandidateScreeningState.Update;

type CandidateScreeningGraphResources = {
  adapter: CandidateSourceAdapter | null;
  latestStats: ScreeningRunStats;
};

export function createEmptyStats(): ScreeningRunStats {
  return {
    fetched: 0,
    deduped: 0,
    stored: 0,
    vectorRecalled: 0,
    evaluated: 0,
    recommendedChat: 0,
    recommendedCollect: 0,
    skipped: 0,
    failed: 0,
  };
}

function resolveDependencies(
  overrides?: ScreeningRunnerDependencyOverrides,
): ScreeningRunnerDependencies {
  return {
    ...defaultDependencies,
    ...overrides,
    repo: {
      ...defaultDependencies.repo,
      ...overrides?.repo,
    },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'candidate screening failed';
}

async function closeAdapterSafely(adapter: CandidateSourceAdapter | null): Promise<void> {
  if (!adapter) return;

  try {
    await adapter.close();
  } catch {
    // Closing browser resources is best-effort after run/action state is already persisted.
  }
}

function incrementDecisionStats(stats: ScreeningRunStats, action: CandidateDecisionAction): void {
  if (action === 'chat') {
    stats.recommendedChat += 1;
    return;
  }
  if (action === 'collect') {
    stats.recommendedCollect += 1;
    return;
  }
  stats.skipped += 1;
}

function copyStats(stats: ScreeningRunStats): ScreeningRunStats {
  return { ...stats };
}

function rememberStats(
  resources: CandidateScreeningGraphResources,
  stats: ScreeningRunStats,
): ScreeningRunStats {
  resources.latestStats = copyStats(stats);
  return stats;
}

function requireSearchPlan(state: CandidateScreeningGraphState): SearchPlan {
  if (!state.searchPlan) {
    throw new Error('candidate screening search plan is required');
  }
  return state.searchPlan;
}

function requireEvaluationSchema(state: CandidateScreeningGraphState): EvaluationSchema {
  if (!state.evaluationSchema) {
    throw new Error('candidate screening evaluation schema is required');
  }
  return state.evaluationSchema;
}

function createActionPlan(params: {
  action: CandidateActionPlan;
  candidateName: string;
  jobTitle: string;
}): CandidateActionPlan {
  return createDryRunActionPlan({
    action: params.action.action,
    priority: params.action.priority,
    candidateName: params.candidateName,
    jobTitle: params.jobTitle,
    reason: params.action.reason,
  });
}

async function updateStage(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  currentStage:
    | 'planning'
    | 'searching_live'
    | 'ingesting_live'
    | 'recalling_vectors'
    | 'evaluating'
    | 'ranking'
    | 'planning_actions'
    | 'executing_actions';
  stats: ScreeningRunStats;
}): Promise<void> {
  await params.dependencies.repo.updateRun({
    userId: params.userId,
    runId: params.runId,
    currentStage: params.currentStage,
    stats: copyStats(params.stats),
  });
}

function buildVectorInputs(
  recalledCandidates: Awaited<ReturnType<typeof recallCandidatesForJd>>,
  contexts: Map<string, CandidateContext>,
): RankInput[] {
  return recalledCandidates.map((candidate) => {
    if (!contexts.has(candidate.candidateId)) {
      contexts.set(candidate.candidateId, {
        candidateId: candidate.candidateId,
        resumeId: candidate.resumeId,
        resumeText: candidate.content,
        displayName: candidate.displayName,
        profileUrl: candidate.profileUrl,
      });
    }

    return {
      candidateId: candidate.candidateId,
      matchScore: candidate.score,
    };
  });
}

async function collectRawCandidates(params: {
  adapter: CandidateSourceAdapter;
  searchPlan: SearchPlan;
  request: CreateScreeningRunRequest;
  stats: ScreeningRunStats;
}): Promise<RawCandidate[]> {
  const rawCandidates: RawCandidate[] = [];

  for await (const batch of params.adapter.searchCandidates(params.searchPlan, {
    maxCandidates: params.request.maxCandidates,
    batchSize: params.request.batchSize,
  })) {
    for (const rawCandidate of batch.candidates) {
      if (rawCandidates.length >= params.request.maxCandidates) {
        return rawCandidates;
      }
      rawCandidates.push(rawCandidate);
      params.stats.fetched += 1;
    }
  }

  return rawCandidates;
}

async function evaluateCandidates(params: {
  dependencies: ScreeningRunnerDependencies;
  contexts: Map<string, CandidateContext>;
  jobDescription: JobDescriptionDto;
  evaluationSchema: EvaluationSchema;
  stats: ScreeningRunStats;
  strictEvaluation: boolean;
}): Promise<Map<string, CandidateEvaluation>> {
  const evaluations = new Map<string, CandidateEvaluation>();

  for (const context of params.contexts.values()) {
    const evaluation = await params.dependencies.evaluateCandidate({
      jobTitle: params.jobDescription.position,
      evaluationSchema: params.evaluationSchema,
      resumeText: context.resumeText,
      candidateName: context.displayName,
      strict: params.strictEvaluation,
    });
    evaluations.set(context.candidateId, evaluation);
    params.stats.evaluated += 1;
  }

  return evaluations;
}

async function createPlannedActions(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  jobDescription: JobDescriptionDto;
  request: CreateScreeningRunRequest;
  rankedCandidates: RankedCandidate[];
  contexts: Map<string, CandidateContext>;
  evaluations: Map<string, CandidateEvaluation>;
  stats: ScreeningRunStats;
}): Promise<void> {
  for (const rankedCandidate of params.rankedCandidates) {
    const context = params.contexts.get(rankedCandidate.candidateId);
    const evaluation = params.evaluations.get(rankedCandidate.candidateId);
    if (!context || !evaluation) {
      continue;
    }

    const actionPlan = createActionPlan({
      action: evaluation.decision,
      candidateName: context.displayName,
      jobTitle: params.jobDescription.position,
    });
    const actionStatus =
      params.request.mode === 'execution' && actionPlan.action === 'skip' ? 'skipped' : 'planned';
    incrementDecisionStats(params.stats, actionPlan.action);

    const result = await params.dependencies.repo.upsertResult({
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescription.id,
      candidateId: rankedCandidate.candidateId,
      resumeId: context.resumeId,
      source: rankedCandidate.source,
      tags: evaluation.tags,
      scoreDetail: evaluation.score,
      finalScore: evaluation.score.total,
      rank: rankedCandidate.rank,
      decisionAction: actionPlan.action,
      decisionPriority: actionPlan.priority,
      decisionReason: actionPlan.reason,
      actionPlan,
      actionStatus,
      interviewStage: actionPlan.action === 'skip' ? 'screened' : 'to_contact',
      notes: null,
    });

    await params.dependencies.repo.createActionLog({
      userId: params.userId,
      runId: params.runId,
      screeningResultId: result.id,
      candidateId: rankedCandidate.candidateId,
      jobDescriptionId: params.jobDescription.id,
      platform: params.request.platform,
      mode: params.request.mode,
      action: actionPlan.action,
      message: actionPlan.message,
      status: actionStatus,
      idempotencyKey: createActionIdempotencyKey({
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescription.id,
        candidateId: rankedCandidate.candidateId,
        platform: params.request.platform,
        action: actionPlan.action,
      }),
    });
  }
}

function makeCandidateScreeningGraph(resources: CandidateScreeningGraphResources) {
  async function startRunNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    await state.dependencies.repo.updateRun({
      userId: state.userId,
      runId: state.runId,
      status: 'running',
      currentStage: 'planning',
      startedAt: new Date(),
      errorMessage: null,
      stats: copyStats(stats),
    });

    return {
      stats: rememberStats(resources, stats),
      rawCandidates: [],
      contexts: new Map(),
      liveInputs: [],
      vectorInputs: [],
      evaluations: new Map(),
      rankedCandidates: [],
      route: 'finalize',
    };
  }

  async function planNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const { searchPlan, evaluationSchema } = state.dependencies.buildPlan(state.jobDescription);
    await state.dependencies.repo.updateRun({
      userId: state.userId,
      runId: state.runId,
      searchPlan,
      evaluationSchema,
      stats: copyStats(state.stats),
    });

    return { searchPlan, evaluationSchema };
  }

  async function searchLiveNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'searching_live',
      stats,
    });

    const adapter = state.dependencies.createAdapter(state.request.platform);
    resources.adapter = adapter;
    await adapter.loginIfNeeded();
    const rawCandidates = await collectRawCandidates({
      adapter,
      searchPlan: requireSearchPlan(state),
      request: state.request,
      stats,
    });

    return { rawCandidates, stats: rememberStats(resources, stats) };
  }

  async function ingestLiveNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    const contexts = new Map(state.contexts);
    const liveInputs: RankInput[] = [];
    const dedupe = createInMemoryDedupeState();

    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'ingesting_live',
      stats,
    });

    for (const rawCandidate of state.rawCandidates) {
      const stored = await state.dependencies.ingestCandidate({
        userId: state.userId,
        sourcePlatform: state.request.platform,
        rawCandidate,
      });

      if (!dedupe.markSeen(stored.identityHash)) {
        stats.deduped += 1;
        continue;
      }

      stats.stored += 1;
      contexts.set(stored.candidateId, {
        candidateId: stored.candidateId,
        resumeId: stored.resumeId,
        resumeText: rawCandidate.resumeText,
        displayName: rawCandidate.name,
        profileUrl: rawCandidate.profileUrl ?? null,
      });
      liveInputs.push({ candidateId: stored.candidateId, matchScore: 1 });
    }

    return { contexts, liveInputs, stats: rememberStats(resources, stats) };
  }

  async function recallVectorsNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    const contexts = new Map(state.contexts);
    const searchPlan = requireSearchPlan(state);

    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'recalling_vectors',
      stats,
    });

    const recalledCandidates = await state.dependencies.recallCandidates({
      userId: state.userId,
      retrievalQuery: searchPlan.retrievalQuery,
      topK: state.request.maxCandidates,
      allowAlreadyContacted: state.request.allowAlreadyContacted,
    });
    stats.vectorRecalled = recalledCandidates.length;

    return {
      contexts,
      vectorInputs: buildVectorInputs(recalledCandidates, contexts),
      stats: rememberStats(resources, stats),
    };
  }

  async function evaluateNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'evaluating',
      stats,
    });

    const evaluations = await evaluateCandidates({
      dependencies: state.dependencies,
      contexts: state.contexts,
      jobDescription: state.jobDescription,
      evaluationSchema: requireEvaluationSchema(state),
      stats,
      strictEvaluation: state.request.mode === 'execution',
    });

    return { evaluations, stats: rememberStats(resources, stats) };
  }

  async function rankNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'ranking',
      stats,
    });

    return {
      rankedCandidates: state.dependencies.mergeAndRank({
        live: state.liveInputs,
        vector: state.vectorInputs,
      }),
      stats: rememberStats(resources, stats),
    };
  }

  async function planActionsNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'planning_actions',
      stats,
    });
    await createPlannedActions({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescription: state.jobDescription,
      request: state.request,
      rankedCandidates: state.rankedCandidates,
      contexts: state.contexts,
      evaluations: state.evaluations,
      stats,
    });

    return {
      stats: rememberStats(resources, stats),
      route: state.request.mode === 'execution' ? 'execute_actions' : 'finalize',
    };
  }

  async function executeActionsNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    const stats = copyStats(state.stats);
    const adapter = resources.adapter;
    if (!adapter) {
      throw new Error('candidate screening execution requires an initialized adapter');
    }

    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'executing_actions',
      stats,
    });
    await executePlannedActionsForRun({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      getAdapterAfterClaim: async () => adapter,
      request: {
        confirmExecution: true,
        maxChatActions: state.request.maxCandidates,
        maxCollectActions: state.request.maxCandidates,
      },
      stats,
    });

    return { stats: rememberStats(resources, stats) };
  }

  async function finalizeNode(
    state: CandidateScreeningGraphState,
  ): Promise<CandidateScreeningGraphUpdate> {
    await state.dependencies.repo.updateRun({
      userId: state.userId,
      runId: state.runId,
      status: 'success',
      currentStage: 'finalizing',
      errorMessage: null,
      finishedAt: new Date(),
      stats: copyStats(state.stats),
    });
    return {};
  }

  function routeAfterPlanning(state: CandidateScreeningGraphState): CandidateScreeningGraphRoute {
    return state.route;
  }

  return new StateGraph(CandidateScreeningState)
    .addNode('start_run', startRunNode)
    .addNode('plan', planNode)
    .addNode('search_live', searchLiveNode)
    .addNode('ingest_live', ingestLiveNode)
    .addNode('recall_vectors', recallVectorsNode)
    .addNode('evaluate', evaluateNode)
    .addNode('rank', rankNode)
    .addNode('plan_actions', planActionsNode)
    .addNode('execute_actions', executeActionsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'start_run')
    .addEdge('start_run', 'plan')
    .addEdge('plan', 'search_live')
    .addEdge('search_live', 'ingest_live')
    .addEdge('ingest_live', 'recall_vectors')
    .addEdge('recall_vectors', 'evaluate')
    .addEdge('evaluate', 'rank')
    .addEdge('rank', 'plan_actions')
    .addConditionalEdges('plan_actions', routeAfterPlanning, {
      execute_actions: 'execute_actions',
      finalize: 'finalize',
    })
    .addEdge('execute_actions', 'finalize')
    .addEdge('finalize', END)
    .compile();
}

export const runCandidateScreeningGraph = async (params: {
  runId: string;
  userId: string;
  jobDescription: JobDescriptionDto;
  request: CreateScreeningRunRequest;
  dependencies?: ScreeningRunnerDependencyOverrides;
}): Promise<void> => {
  const dependencies = resolveDependencies(params.dependencies);
  const initialStats = createEmptyStats();
  const resources: CandidateScreeningGraphResources = {
    adapter: null,
    latestStats: copyStats(initialStats),
  };
  const graph = makeCandidateScreeningGraph(resources);

  try {
    await graph.invoke(
      {
        runId: params.runId,
        userId: params.userId,
        jobDescription: params.jobDescription,
        request: params.request,
        dependencies,
        stats: initialStats,
        searchPlan: undefined,
        evaluationSchema: undefined,
        rawCandidates: [],
        contexts: new Map(),
        liveInputs: [],
        vectorInputs: [],
        evaluations: new Map(),
        rankedCandidates: [],
        route: 'finalize',
      },
      { recursionLimit: 50 },
    );
  } catch (error) {
    const stats = copyStats(resources.latestStats);
    stats.failed += 1;
    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'failed',
      errorMessage: getErrorMessage(error),
      finishedAt: new Date(),
      stats: copyStats(stats),
    });
  } finally {
    await closeAdapterSafely(resources.adapter);
  }
};

export const runCandidateScreening = runCandidateScreeningGraph;

function getPlannedActionLog(
  detail: CandidateScreeningDetailDto,
  action: CandidateDecisionAction,
  runId: string,
): CandidateActionLogDto | null {
  return (
    detail.actionLogs.find(
      (actionLog) =>
        actionLog.runId === runId && actionLog.action === action && actionLog.status === 'planned',
    ) ?? null
  );
}

function createStoredCandidateRef(result: CandidateScreeningResultListItem): StoredCandidateRef {
  return {
    candidateId: result.candidate.id,
    displayName: result.candidate.displayName,
    profileUrl: result.candidate.profileUrl,
  };
}

function shouldExecuteAction(params: {
  result: CandidateScreeningResultListItem;
  chatCount: number;
  collectCount: number;
  request: ExecuteActionsRequest;
}): boolean {
  if (!params.result.actionPlan) return false;
  if (params.result.actionStatus !== 'planned') return false;
  if (params.result.actionPlan.action === 'skip') return false;
  if (
    params.result.actionPlan.action === 'chat' &&
    params.chatCount >= params.request.maxChatActions
  ) {
    return false;
  }
  if (
    params.result.actionPlan.action === 'collect' &&
    params.collectCount >= params.request.maxCollectActions
  ) {
    return false;
  }
  return true;
}

async function persistExecutionResult(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  result: CandidateScreeningResultListItem;
  actionPlan: CandidateActionPlan;
  actionLog: CandidateActionLogDto;
  executionResult: Awaited<ReturnType<CandidateSourceAdapter['chatCandidate']>>;
  stats: ScreeningRunStats;
}): Promise<void> {
  if (!params.executionResult.success) {
    await markExecutionFailed({
      dependencies: params.dependencies,
      userId: params.userId,
      runId: params.runId,
      result: params.result,
      actionPlan: params.actionPlan,
      actionLog: params.actionLog,
      errorMessage: params.executionResult.error ?? 'action execution failed',
      browserTrace: params.executionResult.browserTrace ?? null,
      stats: params.stats,
    });
    return;
  }

  await params.dependencies.repo.updateActionLog({
    userId: params.userId,
    id: params.actionLog.id,
    status: 'success',
    browserTrace: params.executionResult.browserTrace ?? null,
    errorMessage: null,
  });
  await params.dependencies.repo.upsertResult({
    userId: params.userId,
    runId: params.runId,
    jobDescriptionId: params.result.jobDescriptionId,
    candidateId: params.result.candidateId,
    resumeId: params.result.resumeId,
    source: params.result.source,
    tags: params.result.tags,
    scoreDetail: params.result.scoreDetail,
    finalScore: params.result.finalScore,
    rank: params.result.rank,
    decisionAction: params.result.decisionAction,
    decisionPriority: params.result.decisionPriority,
    decisionReason: params.result.decisionReason,
    actionPlan: params.actionPlan,
    actionStatus: 'success',
    interviewStage: params.actionPlan.action === 'chat' ? 'contacted' : 'collected',
    notes: params.result.notes,
  });

  if (params.actionPlan.action === 'chat') {
    await params.dependencies.repo.upsertCandidate({
      userId: params.userId,
      sourcePlatform: params.result.candidate.sourcePlatform,
      displayName: params.result.candidate.displayName,
      currentTitle: params.result.candidate.currentTitle,
      currentCompany: params.result.candidate.currentCompany,
      location: params.result.candidate.location,
      experienceYears: params.result.candidate.experienceYears,
      platformCandidateId: params.result.candidate.platformCandidateId,
      profileUrl: params.result.candidate.profileUrl,
      identityKey: params.result.candidate.identityKey,
      identityHash: params.result.candidate.identityHash,
      lastActiveAt: params.result.candidate.lastActiveAt
        ? new Date(params.result.candidate.lastActiveAt)
        : null,
      contacted: true,
      lastContactAt: new Date(),
    });
  }
}

async function markExecutionFailed(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  result: CandidateScreeningResultListItem;
  actionPlan: CandidateActionPlan;
  actionLog: CandidateActionLogDto;
  errorMessage: string;
  browserTrace?: Record<string, unknown> | null;
  stats: ScreeningRunStats;
}): Promise<void> {
  params.stats.failed += 1;
  await params.dependencies.repo.updateActionLog({
    userId: params.userId,
    id: params.actionLog.id,
    status: 'failed',
    browserTrace: params.browserTrace ?? null,
    errorMessage: params.errorMessage,
  });
  await params.dependencies.repo.upsertResult({
    userId: params.userId,
    runId: params.runId,
    jobDescriptionId: params.result.jobDescriptionId,
    candidateId: params.result.candidateId,
    resumeId: params.result.resumeId,
    source: params.result.source,
    tags: params.result.tags,
    scoreDetail: params.result.scoreDetail,
    finalScore: params.result.finalScore,
    rank: params.result.rank,
    decisionAction: params.result.decisionAction,
    decisionPriority: params.result.decisionPriority,
    decisionReason: params.result.decisionReason,
    actionPlan: params.actionPlan,
    actionStatus: 'failed',
    interviewStage: params.result.interviewStage,
    notes: params.result.notes,
  });
}

async function executePlannedActionsForRun(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  getAdapterAfterClaim: () => Promise<CandidateSourceAdapter>;
  request: ExecuteActionsRequest;
  stats: ScreeningRunStats;
}): Promise<void> {
  let chatCount = 0;
  let collectCount = 0;

  const results = await params.dependencies.repo.listResults({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    runId: params.runId,
    plannedActions: ['chat', 'collect'],
    limit: params.request.maxChatActions + params.request.maxCollectActions + 100,
    offset: 0,
  });

  for (const result of results) {
    if (
      !shouldExecuteAction({
        result,
        chatCount,
        collectCount,
        request: params.request,
      }) ||
      !result.actionPlan
    ) {
      continue;
    }

    const detail = await params.dependencies.repo.getDetail({
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: result.candidateId,
    });
    if (!detail) continue;

    const actionLog = getPlannedActionLog(detail, result.actionPlan.action, params.runId);
    if (!actionLog) continue;

    const claimedActionLog = await params.dependencies.repo.claimActionLog({
      userId: params.userId,
      id: actionLog.id,
    });
    if (!claimedActionLog) continue;

    try {
      const adapter = await params.getAdapterAfterClaim();
      const storedCandidate = createStoredCandidateRef(result);
      const executionResult =
        result.actionPlan.action === 'chat'
          ? await adapter.chatCandidate(storedCandidate, result.actionPlan)
          : await adapter.collectCandidate(storedCandidate);

      await persistExecutionResult({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        result,
        actionPlan: result.actionPlan,
        actionLog: claimedActionLog,
        executionResult,
        stats: params.stats,
      });
    } catch (error) {
      await markExecutionFailed({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        result,
        actionPlan: result.actionPlan,
        actionLog: claimedActionLog,
        errorMessage: getErrorMessage(error),
        stats: params.stats,
      });
    }

    if (result.actionPlan.action === 'chat') {
      chatCount += 1;
    } else {
      collectCount += 1;
    }
  }
}

export async function executeScreeningRunActions(params: {
  runId: string;
  userId: string;
  request: ExecuteActionsRequest;
  dependencies?: ScreeningRunnerDependencyOverrides;
}): Promise<void> {
  const dependencies = resolveDependencies(params.dependencies);
  const run = await dependencies.repo.getRun({ userId: params.userId, runId: params.runId });
  if (!run) {
    throw new Error('candidate screening run not found');
  }

  const currentRun = run;
  const stats = currentRun.stats ? copyStats(currentRun.stats) : createEmptyStats();
  let adapter: CandidateSourceAdapter | null = null;

  async function getAdapterAfterClaim(): Promise<CandidateSourceAdapter> {
    if (adapter) {
      return adapter;
    }

    const nextAdapter = dependencies.createAdapter(currentRun.platform);
    try {
      await nextAdapter.loginIfNeeded();
    } catch (error) {
      await closeAdapterSafely(nextAdapter);
      throw error;
    }
    adapter = nextAdapter;
    return adapter;
  }

  try {
    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'running',
      currentStage: 'executing_actions',
      errorMessage: null,
      finishedAt: null,
      stats: copyStats(stats),
    });

    await executePlannedActionsForRun({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: currentRun.jobDescriptionId,
      getAdapterAfterClaim,
      request: params.request,
      stats,
    });

    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'success',
      currentStage: 'finalizing',
      errorMessage: null,
      finishedAt: new Date(),
      stats: copyStats(stats),
    });
  } catch (error) {
    stats.failed += 1;
    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'failed',
      errorMessage: getErrorMessage(error),
      finishedAt: new Date(),
      stats: copyStats(stats),
    });
  } finally {
    await closeAdapterSafely(adapter);
  }
}
