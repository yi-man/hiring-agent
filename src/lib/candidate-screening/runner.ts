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
  },
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
    | 'planning_actions';
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
}): Promise<Map<string, CandidateEvaluation>> {
  const evaluations = new Map<string, CandidateEvaluation>();

  for (const context of params.contexts.values()) {
    const evaluation = await params.dependencies.evaluateCandidate({
      jobTitle: params.jobDescription.position,
      evaluationSchema: params.evaluationSchema,
      resumeText: context.resumeText,
      candidateName: context.displayName,
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
      actionStatus: 'planned',
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
      mode: 'dry_run',
      action: actionPlan.action,
      message: actionPlan.message,
      status: 'planned',
      idempotencyKey: createActionIdempotencyKey({
        userId: params.userId,
        jobDescriptionId: params.jobDescription.id,
        candidateId: rankedCandidate.candidateId,
        platform: params.request.platform,
        action: actionPlan.action,
      }),
    });
  }
}

export async function runCandidateScreening(params: {
  runId: string;
  userId: string;
  jobDescription: JobDescriptionDto;
  request: CreateScreeningRunRequest;
  dependencies?: ScreeningRunnerDependencyOverrides;
}): Promise<void> {
  const dependencies = resolveDependencies(params.dependencies);
  const stats = createEmptyStats();
  const contexts = new Map<string, CandidateContext>();
  const dedupe = createInMemoryDedupeState();
  let adapter: CandidateSourceAdapter | null = null;

  try {
    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'running',
      currentStage: 'planning',
      startedAt: new Date(),
      errorMessage: null,
      stats: copyStats(stats),
    });

    const { searchPlan, evaluationSchema } = dependencies.buildPlan(params.jobDescription);
    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      searchPlan,
      evaluationSchema,
      stats: copyStats(stats),
    });

    await updateStage({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      currentStage: 'searching_live',
      stats,
    });
    adapter = dependencies.createAdapter(params.request.platform);
    await adapter.loginIfNeeded();
    const rawCandidates = await collectRawCandidates({
      adapter,
      searchPlan,
      request: params.request,
      stats,
    });

    await updateStage({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      currentStage: 'ingesting_live',
      stats,
    });
    const liveInputs: RankInput[] = [];
    for (const rawCandidate of rawCandidates) {
      const stored = await dependencies.ingestCandidate({
        userId: params.userId,
        sourcePlatform: params.request.platform,
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

    await updateStage({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      currentStage: 'recalling_vectors',
      stats,
    });
    const recalledCandidates = await dependencies.recallCandidates({
      userId: params.userId,
      retrievalQuery: searchPlan.retrievalQuery,
      topK: params.request.maxCandidates,
      allowAlreadyContacted: params.request.allowAlreadyContacted,
    });
    stats.vectorRecalled = recalledCandidates.length;
    const vectorInputs = buildVectorInputs(recalledCandidates, contexts);

    await updateStage({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      currentStage: 'evaluating',
      stats,
    });
    const evaluations = await evaluateCandidates({
      dependencies,
      contexts,
      jobDescription: params.jobDescription,
      evaluationSchema,
      stats,
    });

    await updateStage({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      currentStage: 'ranking',
      stats,
    });
    const rankedCandidates = dependencies.mergeAndRank({
      live: liveInputs,
      vector: vectorInputs,
    });

    await updateStage({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      currentStage: 'planning_actions',
      stats,
    });
    await createPlannedActions({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescription: params.jobDescription,
      request: params.request,
      rankedCandidates,
      contexts,
      evaluations,
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
    await adapter?.close();
  }
}

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
  runId: string;
  chatCount: number;
  collectCount: number;
  request: ExecuteActionsRequest;
}): boolean {
  if (params.result.runId !== params.runId) return false;
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
    params.stats.failed += 1;
    await params.dependencies.repo.updateActionLog({
      userId: params.userId,
      id: params.actionLog.id,
      status: 'failed',
      browserTrace: params.executionResult.browserTrace ?? null,
      errorMessage: params.executionResult.error ?? 'action execution failed',
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
    return;
  }

  incrementDecisionStats(params.stats, params.actionPlan.action);
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

  const stats = run.stats ? copyStats(run.stats) : createEmptyStats();
  let adapter: CandidateSourceAdapter | null = null;
  let chatCount = 0;
  let collectCount = 0;

  try {
    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'running',
      currentStage: 'executing_actions',
      stats: copyStats(stats),
    });

    adapter = dependencies.createAdapter(run.platform);
    await adapter.loginIfNeeded();
    const results = await dependencies.repo.listResults({
      userId: params.userId,
      jobDescriptionId: run.jobDescriptionId,
      limit: params.request.maxChatActions + params.request.maxCollectActions + 100,
      offset: 0,
    });

    for (const result of results) {
      if (
        !shouldExecuteAction({
          result,
          runId: params.runId,
          chatCount,
          collectCount,
          request: params.request,
        }) ||
        !result.actionPlan
      ) {
        continue;
      }

      const detail = await dependencies.repo.getDetail({
        userId: params.userId,
        jobDescriptionId: run.jobDescriptionId,
        candidateId: result.candidateId,
      });
      if (!detail) {
        continue;
      }

      const actionLog = getPlannedActionLog(detail, result.actionPlan.action, params.runId);
      if (!actionLog) {
        continue;
      }

      await dependencies.repo.updateActionLog({
        userId: params.userId,
        id: actionLog.id,
        status: 'running',
        browserTrace: null,
        errorMessage: null,
      });

      const storedCandidate = createStoredCandidateRef(result);
      const executionResult =
        result.actionPlan.action === 'chat'
          ? await adapter.chatCandidate(storedCandidate, result.actionPlan)
          : await adapter.collectCandidate(storedCandidate);

      await persistExecutionResult({
        dependencies,
        userId: params.userId,
        runId: params.runId,
        result,
        actionPlan: result.actionPlan,
        actionLog,
        executionResult,
        stats,
      });

      if (result.actionPlan.action === 'chat') {
        chatCount += 1;
      } else {
        collectCount += 1;
      }
    }

    await dependencies.repo.updateRun({
      userId: params.userId,
      runId: params.runId,
      status: 'success',
      currentStage: 'finalizing',
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
    await adapter?.close();
  }
}
