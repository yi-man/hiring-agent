import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  createActionIdempotencyKey,
  createDryRunActionPlan,
  plannedActionSequence,
} from './actions';
import { resolveBossLikeProfileUrl } from './adapters/boss-like';
import { createCandidateSourceAdapter } from './adapters/factory';
import type {
  ActionExecutionResult,
  CandidateSourceAdapter,
  StoredCandidateRef,
} from './adapters/types';
import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
  MAX_SCREENING_EVALUATION_CANDIDATES,
  MAX_VECTOR_RECALL_CANDIDATES,
} from './constants';
import { createCandidateIdentity, createInMemoryDedupeState } from './dedupe';
import { evaluateCandidateForJd } from './evaluation';
import { ingestRawCandidate, type RawCandidate } from './ingest';
import { buildScreeningPlanFromJd } from './planner';
import { mergeAndRankCandidates, type RankInput, type RankedCandidate } from './ranking';
import { recallCandidatesForJd } from './recall';
import {
  claimCandidateActionLog,
  claimRetryableCollectActionLog,
  createCandidateActionLog,
  getCandidateScreeningDetail,
  getCandidateScreeningRun,
  listCandidateScreeningRunEvents,
  listCandidateScreeningResults,
  updateCandidateActionLog,
  updateCandidateScreeningRun,
  upsertCandidateWithIdentity,
  upsertCandidateScreeningResult,
  createCandidateScreeningRunEvent,
  type CandidateActionLogDto,
  type CandidateScreeningDetailDto,
  type CandidateScreeningResultListItem,
} from './repo';
import {
  createCandidateScreeningWorkflowSession,
  type CandidateScreeningWorkflowSession,
} from './workflow/executor';
import type {
  CandidateActionPlan,
  CandidateDecisionAction,
  CandidateScreeningPlatform,
  CreateScreeningRunRequest,
  EvaluationSchema,
  ExecuteActionsRequest,
  CandidateScreeningRunStage,
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
  contacted: boolean;
};

type CandidateEvaluation = Awaited<ReturnType<typeof evaluateCandidateForJd>>;
type CandidateScreeningGraphRoute = 'execute_actions' | 'finalize';
type ScoreQualityVersions = {
  promptVersion: string | null;
  scoringVersion: string | null;
  calibrationVersion: string | null;
  qualityPolicyVersion: string | null;
};
type SeenIdentityRef = {
  candidateName: string;
  candidateId: string | null;
  resumeId: string | null;
  title: string | null;
  company: string | null;
  profileUrl: string | null;
  platformCandidateId: string | null;
};

export type ScreeningRunnerDependencies = {
  buildPlan: typeof buildScreeningPlanFromJd;
  createAdapter: typeof createCandidateSourceAdapter;
  createWorkflowSession: typeof createCandidateScreeningWorkflowSession;
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
    createRunEvent: typeof createCandidateScreeningRunEvent;
    listResults: typeof listCandidateScreeningResults;
    getDetail: typeof getCandidateScreeningDetail;
    upsertCandidate: typeof upsertCandidateWithIdentity;
    claimActionLog: typeof claimCandidateActionLog;
    claimRetryableCollectActionLog: typeof claimRetryableCollectActionLog;
    listRunEvents: typeof listCandidateScreeningRunEvents;
  };
};

type ScreeningRunnerDependencyOverrides = Partial<Omit<ScreeningRunnerDependencies, 'repo'>> & {
  repo?: Partial<ScreeningRunnerDependencies['repo']>;
};

export type ExecuteSingleCandidateActionResult = {
  status: 'success' | 'failed';
  candidateId: string;
  candidateName: string | null;
  detail: string;
  errorMessage?: string | null;
};

const defaultDependencies: ScreeningRunnerDependencies = {
  buildPlan: buildScreeningPlanFromJd,
  createAdapter: createCandidateSourceAdapter,
  createWorkflowSession: createCandidateScreeningWorkflowSession,
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
    createRunEvent: createCandidateScreeningRunEvent,
    listResults: listCandidateScreeningResults,
    getDetail: getCandidateScreeningDetail,
    upsertCandidate: upsertCandidateWithIdentity,
    claimActionLog: claimCandidateActionLog,
    claimRetryableCollectActionLog: claimRetryableCollectActionLog,
    listRunEvents: listCandidateScreeningRunEvents,
  },
};

const CURRENT_SCORE_QUALITY_VERSIONS: ScoreQualityVersions = {
  promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
  scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
  calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
  qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
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
  candidatePool: Annotation<RankedCandidate[]>(),
  evaluations: Annotation<Map<string, CandidateEvaluation>>(),
  rankedCandidates: Annotation<RankedCandidate[]>(),
  route: Annotation<CandidateScreeningGraphRoute>(),
});

type CandidateScreeningGraphState = typeof CandidateScreeningState.State;
type CandidateScreeningGraphUpdate = typeof CandidateScreeningState.Update;

type CandidateScreeningGraphResources = {
  adapter: CandidateSourceAdapter | null;
  workflowSession: CandidateScreeningWorkflowSession | null;
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

async function recordRunEvent(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  candidateId?: string | null;
  stage: CandidateScreeningRunStage;
  level?: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  await params.dependencies.repo.createRunEvent({
    userId: params.userId,
    runId: params.runId,
    jobDescriptionId: params.jobDescriptionId,
    candidateId: params.candidateId ?? null,
    stage: params.stage,
    level: params.level ?? 'info',
    message: params.message,
    detail: params.detail ?? null,
  });
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

function resolveVectorRecallTopK(maxCandidates: number): number {
  return Math.min(maxCandidates, MAX_VECTOR_RECALL_CANDIDATES);
}

function resolveEvaluationLimit(maxCandidates: number): number {
  return Math.min(maxCandidates, MAX_SCREENING_EVALUATION_CANDIDATES);
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
    | 'indexing_resumes'
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

type RecalledCandidate = Awaited<ReturnType<typeof recallCandidatesForJd>>[number];

type SkippedVectorCandidate = {
  candidate: RecalledCandidate;
  reason: string;
};

function getUnusableProfileUrlReason(params: {
  platform: CandidateScreeningPlatform;
  profileUrl: string | null | undefined;
}): string | null {
  if (params.platform !== 'boss-like') return null;
  const resolution = resolveBossLikeProfileUrl(
    params.profileUrl,
    process.env.BOSS_LIKE_BASE_URL ?? 'http://localhost:6183',
  );
  return resolution.profileUrl ? null : (resolution.error ?? 'candidate profileUrl is unusable');
}

function buildVectorInputs(params: {
  recalledCandidates: Awaited<ReturnType<typeof recallCandidatesForJd>>;
  contexts: Map<string, CandidateContext>;
  platform: CandidateScreeningPlatform;
}): { inputs: RankInput[]; skipped: SkippedVectorCandidate[] } {
  const inputs: RankInput[] = [];
  const skipped: SkippedVectorCandidate[] = [];

  for (const candidate of params.recalledCandidates) {
    if (!params.contexts.has(candidate.candidateId)) {
      const unusableReason = getUnusableProfileUrlReason({
        platform: params.platform,
        profileUrl: candidate.profileUrl,
      });
      if (unusableReason) {
        skipped.push({ candidate, reason: unusableReason });
        continue;
      }

      params.contexts.set(candidate.candidateId, {
        candidateId: candidate.candidateId,
        resumeId: candidate.resumeId,
        resumeText: candidate.content,
        displayName: candidate.displayName,
        profileUrl: candidate.profileUrl,
        contacted: candidate.contacted === true,
      });
    }

    inputs.push({
      candidateId: candidate.candidateId,
      matchScore: candidate.score,
    });
  }

  return { inputs, skipped };
}

function uniqueSearchValues(keywords: string[], fallback: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of keywords) {
    const keyword = value.trim();
    if (keyword && !seen.has(keyword)) {
      seen.add(keyword);
      values.push(keyword);
    }
  }
  if (values.length === 0 && fallback.trim()) {
    values.push(fallback.trim());
  }
  return values;
}

async function collectRawCandidates(params: {
  workflowSession: Pick<
    CandidateScreeningWorkflowSession,
    'runSearchKeyword' | 'observeCandidateProfile'
  >;
  searchPlan: SearchPlan;
  request: CreateScreeningRunRequest;
  stats: ScreeningRunStats;
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  completedKeywords?: ReadonlySet<string>;
}): Promise<RawCandidate[]> {
  const rawCandidates: RawCandidate[] = [];
  const seenIdentityHashes = new Set<string>();

  for (const keyword of uniqueSearchValues(
    params.searchPlan.keywords,
    params.searchPlan.retrievalQuery,
  )) {
    if (params.completedKeywords?.has(keyword)) continue;
    if (rawCandidates.length >= params.request.maxCandidates) break;
    const remaining = params.request.maxCandidates - rawCandidates.length;
    const searched = await params.workflowSession.runSearchKeyword({
      keyword,
      maxCandidates: remaining,
    });
    await recordRunEvent({
      dependencies: params.dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescriptionId,
      stage: 'searching_live',
      level: 'success',
      message: 'search_keyword_completed',
      detail: {
        keyword,
        candidateCount: searched.candidates.length,
        remaining,
      },
    });

    for (const listCandidate of searched.candidates) {
      if (rawCandidates.length >= params.request.maxCandidates) break;
      const identity = createCandidateIdentity({
        sourcePlatform: params.request.platform,
        platformCandidateId: listCandidate.platformCandidateId,
        profileUrl: listCandidate.profileUrl,
        name: listCandidate.name,
        company: listCandidate.company,
        title: listCandidate.title,
      });
      if (seenIdentityHashes.has(identity.identityHash)) {
        params.stats.deduped += 1;
        await recordRunEvent({
          dependencies: params.dependencies,
          userId: params.userId,
          runId: params.runId,
          jobDescriptionId: params.jobDescriptionId,
          stage: 'searching_live',
          level: 'warning',
          message: 'search_candidate_duplicate',
          detail: {
            keyword,
            candidateName: listCandidate.name,
            profileUrl: listCandidate.profileUrl ?? null,
            platformCandidateId: listCandidate.platformCandidateId ?? null,
            dedupeBy: 'raw_identity',
          },
        });
        continue;
      }
      seenIdentityHashes.add(identity.identityHash);
      rawCandidates.push(await params.workflowSession.observeCandidateProfile(listCandidate));
      params.stats.fetched += 1;
    }
  }

  return rawCandidates;
}

function completedSearchKeywords(
  events: Array<{ message: string; detail: Record<string, unknown> | null }>,
): Set<string> {
  const keywords = new Set<string>();
  for (const event of events) {
    if (event.message !== 'search_keyword_completed') continue;
    const keyword = event.detail?.keyword;
    if (typeof keyword === 'string' && keyword.trim()) {
      keywords.add(keyword.trim());
    }
  }
  return keywords;
}

function createRawSeenIdentityRef(rawCandidate: RawCandidate): SeenIdentityRef {
  return {
    candidateName: rawCandidate.name,
    candidateId: null,
    resumeId: null,
    title: rawCandidate.title ?? null,
    company: rawCandidate.company ?? null,
    profileUrl: rawCandidate.profileUrl ?? null,
    platformCandidateId: rawCandidate.platformCandidateId ?? null,
  };
}

function createStoredSeenIdentityRef(
  rawCandidate: RawCandidate,
  stored: Awaited<ReturnType<typeof ingestRawCandidate>>,
): SeenIdentityRef {
  return {
    candidateName: rawCandidate.name,
    candidateId: stored.candidateId,
    resumeId: stored.resumeId,
    title: rawCandidate.title ?? null,
    company: rawCandidate.company ?? null,
    profileUrl: rawCandidate.profileUrl ?? null,
    platformCandidateId: rawCandidate.platformCandidateId ?? null,
  };
}

function evaluationFromScreeningResult(
  result: CandidateScreeningResultListItem,
): CandidateEvaluation {
  return {
    tags: result.tags,
    score: result.scoreDetail,
    decision: {
      action: result.decisionAction,
      priority: result.decisionPriority,
      message: result.actionPlan?.message ?? null,
      reason: result.decisionReason,
    },
  };
}

function isResultCurrentForJobDescription(params: {
  resultUpdatedAt: string;
  jobDescriptionUpdatedAt: string;
}): boolean {
  const resultTime = Date.parse(params.resultUpdatedAt);
  const jobDescriptionTime = Date.parse(params.jobDescriptionUpdatedAt);
  if (!Number.isFinite(resultTime) || !Number.isFinite(jobDescriptionTime)) {
    return false;
  }
  return resultTime >= jobDescriptionTime;
}

function getScoreQualityVersions(result: CandidateScreeningResultListItem): ScoreQualityVersions {
  return {
    promptVersion: result.scoreDetail.promptVersion ?? null,
    scoringVersion: result.scoreDetail.scoringVersion ?? null,
    calibrationVersion: result.scoreDetail.calibrationVersion ?? null,
    qualityPolicyVersion: result.scoreDetail.qualityPolicyVersion ?? null,
  };
}

function isCurrentScoreQualityVersion(result: CandidateScreeningResultListItem): boolean {
  const versions = getScoreQualityVersions(result);
  return (
    versions.promptVersion === CURRENT_SCORE_QUALITY_VERSIONS.promptVersion &&
    versions.scoringVersion === CURRENT_SCORE_QUALITY_VERSIONS.scoringVersion &&
    versions.calibrationVersion === CURRENT_SCORE_QUALITY_VERSIONS.calibrationVersion &&
    versions.qualityPolicyVersion === CURRENT_SCORE_QUALITY_VERSIONS.qualityPolicyVersion
  );
}

function appendEvaluationCandidates(params: {
  target: RankedCandidate[];
  source: RankedCandidate[];
  limit: number;
  cursor: number;
}): number {
  let cursor = params.cursor;
  while (params.target.length < params.limit && cursor < params.source.length) {
    params.target.push(params.source[cursor]);
    cursor += 1;
  }
  return cursor;
}

function appendAlternatingEvaluationCandidates(params: {
  target: RankedCandidate[];
  preferred: RankedCandidate[];
  fallback: RankedCandidate[];
  limit: number;
}): void {
  let preferredCursor = 0;
  let fallbackCursor = 0;
  let preferPreferred = true;

  while (
    params.target.length < params.limit &&
    (preferredCursor < params.preferred.length || fallbackCursor < params.fallback.length)
  ) {
    if (preferPreferred && preferredCursor < params.preferred.length) {
      params.target.push(params.preferred[preferredCursor]);
      preferredCursor += 1;
      preferPreferred = false;
      continue;
    }
    if (!preferPreferred && fallbackCursor < params.fallback.length) {
      params.target.push(params.fallback[fallbackCursor]);
      fallbackCursor += 1;
      preferPreferred = true;
      continue;
    }
    if (preferredCursor < params.preferred.length) {
      preferredCursor = appendEvaluationCandidates({
        target: params.target,
        source: params.preferred,
        limit: params.limit,
        cursor: preferredCursor,
      });
      continue;
    }
    fallbackCursor = appendEvaluationCandidates({
      target: params.target,
      source: params.fallback,
      limit: params.limit,
      cursor: fallbackCursor,
    });
  }
}

function selectEvaluationCandidates(params: {
  liveInputs: RankInput[];
  vectorInputs: RankInput[];
  contexts: Map<string, CandidateContext>;
  maxCandidates: number;
  mergeAndRank: typeof mergeAndRankCandidates;
}): RankedCandidate[] {
  const rankedCandidates = params
    .mergeAndRank({
      live: params.liveInputs,
      vector: params.vectorInputs,
    })
    .filter((candidate) => params.contexts.has(candidate.candidateId));
  const limit = resolveEvaluationLimit(params.maxCandidates);
  const both = rankedCandidates.filter((candidate) => candidate.source === 'both');
  const vectorOnly = rankedCandidates.filter((candidate) => candidate.source === 'vector_recall');
  const liveOnly = rankedCandidates.filter((candidate) => candidate.source === 'live_search');
  const selected: RankedCandidate[] = [];

  appendEvaluationCandidates({ target: selected, source: both, limit, cursor: 0 });
  appendAlternatingEvaluationCandidates({
    target: selected,
    preferred: vectorOnly,
    fallback: liveOnly,
    limit,
  });

  return selected;
}

function selectEvaluationContexts(
  contexts: Map<string, CandidateContext>,
  rankedCandidates: RankedCandidate[],
): Map<string, CandidateContext> {
  const selected = new Map<string, CandidateContext>();
  for (const candidate of rankedCandidates) {
    const context = contexts.get(candidate.candidateId);
    if (context) {
      selected.set(candidate.candidateId, context);
    }
  }
  return selected;
}

function rankEvaluatedCandidates(params: {
  rankedCandidates: RankedCandidate[];
  evaluations: Map<string, CandidateEvaluation>;
}): RankedCandidate[] {
  return params.rankedCandidates
    .filter((candidate) => params.evaluations.has(candidate.candidateId))
    .sort((left, right) => {
      const leftEvaluation = params.evaluations.get(left.candidateId);
      const rightEvaluation = params.evaluations.get(right.candidateId);
      const scoreDiff = (rightEvaluation?.score.total ?? 0) - (leftEvaluation?.score.total ?? 0);
      return (
        scoreDiff ||
        right.matchScore - left.matchScore ||
        left.candidateId.localeCompare(right.candidateId)
      );
    })
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

async function listHistoricalEvaluations(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  jobDescriptionId: string;
  candidateIds: string[];
}): Promise<Map<string, CandidateScreeningResultListItem>> {
  if (params.candidateIds.length === 0) {
    return new Map();
  }

  const results = await params.dependencies.repo.listResults({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    candidateIds: params.candidateIds,
    limit: params.candidateIds.length,
  });
  return new Map(results.map((result) => [result.candidateId, result]));
}

async function listExistingResultsForActionPlanning(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  jobDescriptionId: string;
  rankedCandidates: RankedCandidate[];
  contexts: Map<string, CandidateContext>;
  allowAlreadyContacted: boolean;
}): Promise<Map<string, CandidateScreeningResultListItem>> {
  if (params.allowAlreadyContacted) {
    return new Map();
  }

  const contactedCandidateIds = params.rankedCandidates
    .filter((candidate) => params.contexts.get(candidate.candidateId)?.contacted === true)
    .map((candidate) => candidate.candidateId);
  if (contactedCandidateIds.length === 0) {
    return new Map();
  }

  return listHistoricalEvaluations({
    dependencies: params.dependencies,
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    candidateIds: contactedCandidateIds,
  });
}

async function evaluateCandidates(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  contexts: Map<string, CandidateContext>;
  jobDescription: JobDescriptionDto;
  evaluationSchema: EvaluationSchema;
  stats: ScreeningRunStats;
  strictEvaluation: boolean;
}): Promise<Map<string, CandidateEvaluation>> {
  const evaluations = new Map<string, CandidateEvaluation>();
  const historicalResults = await listHistoricalEvaluations({
    dependencies: params.dependencies,
    userId: params.userId,
    jobDescriptionId: params.jobDescription.id,
    candidateIds: [...params.contexts.keys()],
  });

  for (const context of params.contexts.values()) {
    const historicalResult = historicalResults.get(context.candidateId);
    if (historicalResult) {
      const sameResume =
        historicalResult.resumeId !== null &&
        context.resumeId !== null &&
        historicalResult.resumeId === context.resumeId;
      const sameJobDescriptionVersion = isResultCurrentForJobDescription({
        resultUpdatedAt: historicalResult.updatedAt,
        jobDescriptionUpdatedAt: params.jobDescription.updatedAt,
      });
      const sameScoreQualityVersion = isCurrentScoreQualityVersion(historicalResult);
      const staleReasons = [
        sameResume ? null : '简历已更新，重新评估当前版本',
        sameJobDescriptionVersion ? null : 'JD 已更新，重新评估当前版本',
        sameScoreQualityVersion ? null : '评分质量机制已更新，重新评估当前版本',
      ].filter((reason): reason is string => reason !== null);

      if (staleReasons.length === 0) {
        const evaluation = evaluationFromScreeningResult(historicalResult);
        evaluations.set(context.candidateId, evaluation);
        params.stats.evaluated += 1;
        await recordRunEvent({
          dependencies: params.dependencies,
          userId: params.userId,
          runId: params.runId,
          jobDescriptionId: params.jobDescription.id,
          candidateId: context.candidateId,
          stage: 'evaluating',
          message: `复用历史评估：${context.displayName}`,
          detail: {
            reusedEvaluation: true,
            candidateName: context.displayName,
            candidateId: context.candidateId,
            resumeId: historicalResult.resumeId,
            profileUrl: context.profileUrl,
            resultId: historicalResult.id,
            previousRunId: historicalResult.runId,
            previousUpdatedAt: historicalResult.updatedAt,
            scoreDetail: evaluation.score,
            tags: evaluation.tags,
            decision: evaluation.decision,
          },
        });
        continue;
      }

      await recordRunEvent({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescription.id,
        candidateId: context.candidateId,
        stage: 'evaluating',
        level: 'warning',
        message: `历史评估已过期：${context.displayName}`,
        detail: {
          reusedEvaluation: false,
          staleEvaluation: true,
          staleReasons,
          reason: staleReasons.join('；'),
          candidateName: context.displayName,
          candidateId: context.candidateId,
          resumeId: context.resumeId,
          profileUrl: context.profileUrl,
          resultId: historicalResult.id,
          previousRunId: historicalResult.runId,
          previousUpdatedAt: historicalResult.updatedAt,
          jobDescriptionUpdatedAt: params.jobDescription.updatedAt,
          previousResumeId: historicalResult.resumeId,
          currentResumeId: context.resumeId,
          previousQualityVersions: getScoreQualityVersions(historicalResult),
          currentQualityVersions: CURRENT_SCORE_QUALITY_VERSIONS,
        },
      });
    }

    await recordRunEvent({
      dependencies: params.dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescription.id,
      candidateId: context.candidateId,
      stage: 'evaluating',
      message: `开始评估：${context.displayName}`,
      detail: {
        candidateName: context.displayName,
        resumeId: context.resumeId,
        profileUrl: context.profileUrl,
        criteria: params.evaluationSchema,
      },
    });
    let evaluation: CandidateEvaluation;
    try {
      evaluation = await params.dependencies.evaluateCandidate({
        jobTitle: params.jobDescription.position,
        evaluationSchema: params.evaluationSchema,
        resumeText: context.resumeText,
        candidateName: context.displayName,
        strict: params.strictEvaluation,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      params.stats.failed += 1;
      await recordRunEvent({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescription.id,
        candidateId: context.candidateId,
        stage: 'evaluating',
        level: 'error',
        message: `评估失败：${context.displayName}`,
        detail: {
          candidateName: context.displayName,
          resumeId: context.resumeId,
          profileUrl: context.profileUrl,
          errorMessage,
        },
      });
      continue;
    }
    evaluations.set(context.candidateId, evaluation);
    params.stats.evaluated += 1;
    await recordRunEvent({
      dependencies: params.dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescription.id,
      candidateId: context.candidateId,
      stage: 'evaluating',
      level: 'success',
      message: `完成评估：${context.displayName}`,
      detail: {
        candidateName: context.displayName,
        resumeId: context.resumeId,
        profileUrl: context.profileUrl,
        scoreDetail: evaluation.score,
        tags: evaluation.tags,
        decision: evaluation.decision,
      },
    });
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
  const existingResults = await listExistingResultsForActionPlanning({
    dependencies: params.dependencies,
    userId: params.userId,
    jobDescriptionId: params.jobDescription.id,
    rankedCandidates: params.rankedCandidates,
    contexts: params.contexts,
    allowAlreadyContacted: params.request.allowAlreadyContacted,
  });

  for (const rankedCandidate of params.rankedCandidates) {
    const context = params.contexts.get(rankedCandidate.candidateId);
    const evaluation = params.evaluations.get(rankedCandidate.candidateId);
    if (!context || !evaluation) {
      continue;
    }

    const evaluatedActionPlan = createActionPlan({
      action: evaluation.decision,
      candidateName: context.displayName,
      jobTitle: params.jobDescription.position,
    });
    const skipAlreadyContacted = !params.request.allowAlreadyContacted && context.contacted;
    const actionPlan: CandidateActionPlan =
      skipAlreadyContacted && evaluatedActionPlan.action !== 'skip'
        ? {
            action: 'skip',
            priority: 'low',
            message: null,
            reason: '候选人已联系过，跳过本次自动动作',
          }
        : evaluatedActionPlan;
    const actionStatus =
      actionPlan.action === 'skip' && (params.request.mode === 'execution' || skipAlreadyContacted)
        ? 'skipped'
        : 'planned';
    const existingResult = existingResults.get(rankedCandidate.candidateId);
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
      ...(skipAlreadyContacted && existingResult
        ? {
            actionStatus,
            interviewStage: existingResult.interviewStage,
            notes: existingResult.notes,
          }
        : {
            actionStatus,
            interviewStage: actionPlan.action === 'skip' ? 'screened' : 'to_contact',
            notes: null,
          }),
    });

    const actionsToLog =
      actionPlan.action === 'skip' ? (['skip'] as const) : plannedActionSequence(actionPlan.action);
    for (const action of actionsToLog) {
      await params.dependencies.repo.createActionLog({
        userId: params.userId,
        runId: params.runId,
        screeningResultId: result.id,
        candidateId: rankedCandidate.candidateId,
        jobDescriptionId: params.jobDescription.id,
        platform: params.request.platform,
        mode: params.request.mode,
        action,
        message: action === 'chat' ? actionPlan.message : null,
        status: actionStatus,
        idempotencyKey: createActionIdempotencyKey({
          userId: params.userId,
          runId: params.runId,
          jobDescriptionId: params.jobDescription.id,
          candidateId: rankedCandidate.candidateId,
          platform: params.request.platform,
          action,
        }),
      });
    }
    await recordRunEvent({
      dependencies: params.dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: params.jobDescription.id,
      candidateId: rankedCandidate.candidateId,
      stage: 'planning_actions',
      message: `计划动作：${context.displayName}`,
      detail: {
        candidateName: context.displayName,
        candidateId: rankedCandidate.candidateId,
        rank: rankedCandidate.rank,
        scoreDetail: evaluation.score,
        finalScore: evaluation.score.total,
        evaluatedAction: evaluatedActionPlan.action,
        action: actionPlan.action,
        priority: actionPlan.priority,
        reason: actionPlan.reason,
        status: actionStatus,
        skippedBecauseAlreadyContacted: skipAlreadyContacted,
        contacted: context.contacted,
      },
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
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'planning',
      message: '开始候选人筛选任务',
      detail: {
        platform: state.request.platform,
        mode: state.request.mode,
        maxCandidates: state.request.maxCandidates,
        batchSize: state.request.batchSize,
        allowAlreadyContacted: state.request.allowAlreadyContacted,
      },
    });

    return {
      stats: rememberStats(resources, stats),
      rawCandidates: [],
      contexts: new Map(),
      liveInputs: [],
      vectorInputs: [],
      candidatePool: [],
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
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'planning',
      level: 'success',
      message: '生成搜索计划',
      detail: {
        searchPlan,
        evaluationSchema,
      },
    });
    if (evaluationSchema.calibrationProfile && evaluationSchema.qualityPolicy) {
      await recordRunEvent({
        dependencies: state.dependencies,
        userId: state.userId,
        runId: state.runId,
        jobDescriptionId: state.jobDescription.id,
        stage: 'planning',
        level: 'success',
        message: `加载评分质量机制：${evaluationSchema.calibrationProfile.categoryLabel}`,
        detail: {
          category: evaluationSchema.calibrationProfile.category,
          categoryLabel: evaluationSchema.calibrationProfile.categoryLabel,
          versions: {
            promptVersion: evaluationSchema.qualityPolicy.promptVersion,
            scoringVersion: evaluationSchema.qualityPolicy.scoringVersion,
            calibrationVersion: evaluationSchema.qualityPolicy.calibrationVersion,
            qualityPolicyVersion: evaluationSchema.qualityPolicy.version,
          },
          anchors: evaluationSchema.calibrationProfile.anchors.map((anchor) => ({
            label: anchor.label,
            expectedAction: anchor.expectedAction,
            scoreRange: anchor.scoreRange,
            guidance: anchor.guidance,
          })),
          reviewSampling: evaluationSchema.calibrationProfile.reviewSampling,
          regressionTiers: evaluationSchema.qualityPolicy.regressionTiers.map((tier) => ({
            name: tier.name,
            trigger: tier.trigger,
            llmCalls: tier.llmCalls,
          })),
        },
      });
    }

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
    const searchPlan = requireSearchPlan(state);
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'searching_live',
      message: '开始实时搜索候选人',
      detail: {
        keywords: searchPlan.keywords,
        filters: searchPlan.filters,
        priorityTags: searchPlan.priorityTags,
        maxCandidates: state.request.maxCandidates,
        batchSize: state.request.batchSize,
      },
    });

    const adapter = state.dependencies.createAdapter(state.request.platform, {
      userId: state.userId,
    });
    resources.adapter = adapter;
    const workflowSession = state.dependencies.createWorkflowSession({
      adapter,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      platform: state.request.platform,
      repo: state.dependencies.repo,
    });
    resources.workflowSession = workflowSession;
    const skill = await workflowSession.loadOrExplore({
      searchPlan,
      stage: 'searching_live',
    });
    if (skill) {
      await state.dependencies.repo.updateRun({
        userId: state.userId,
        runId: state.runId,
        skillId: skill.id,
      });
    }
    let rawCandidates: RawCandidate[] = [];
    if (skill) {
      const existingEvents = await state.dependencies.repo.listRunEvents({
        userId: state.userId,
        runId: state.runId,
      });
      rawCandidates = await collectRawCandidates({
        workflowSession,
        searchPlan,
        request: state.request,
        stats,
        dependencies: state.dependencies,
        userId: state.userId,
        runId: state.runId,
        jobDescriptionId: state.jobDescription.id,
        completedKeywords: completedSearchKeywords(existingEvents),
      });
    }
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'searching_live',
      level: 'success',
      message: `实时搜索完成：抓取 ${rawCandidates.length} 人`,
      detail: {
        fetched: rawCandidates.length,
        maxCandidates: state.request.maxCandidates,
        batchSize: state.request.batchSize,
      },
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
    const seenIdentityRefs = new Map<string, SeenIdentityRef>();

    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'ingesting_live',
      stats,
    });
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'ingesting_live',
      message: `抓取简历完成：${state.rawCandidates.length} 人`,
      detail: {
        rawCandidateCount: state.rawCandidates.length,
      },
    });
    await updateStage({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      currentStage: 'indexing_resumes',
      stats,
    });
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'indexing_resumes',
      message: `开始入库去重：待处理 ${state.rawCandidates.length} 人`,
      detail: {
        rawCandidateCount: state.rawCandidates.length,
      },
    });

    for (const rawCandidate of state.rawCandidates) {
      const rawIdentity = createCandidateIdentity({
        sourcePlatform: state.request.platform,
        platformCandidateId: rawCandidate.platformCandidateId,
        profileUrl: rawCandidate.profileUrl,
        name: rawCandidate.name,
        company: rawCandidate.company,
        title: rawCandidate.title,
      });

      if (!dedupe.markSeen(rawIdentity.identityHash)) {
        const duplicateOf = seenIdentityRefs.get(rawIdentity.identityHash) ?? null;
        stats.deduped += 1;
        await recordRunEvent({
          dependencies: state.dependencies,
          userId: state.userId,
          runId: state.runId,
          jobDescriptionId: state.jobDescription.id,
          stage: 'indexing_resumes',
          level: 'warning',
          message: `跳过重复候选人：${rawCandidate.name}`,
          detail: {
            candidateName: rawCandidate.name,
            title: rawCandidate.title ?? null,
            company: rawCandidate.company ?? null,
            profileUrl: rawCandidate.profileUrl ?? null,
            platformCandidateId: rawCandidate.platformCandidateId ?? null,
            dedupeBy: 'raw_identity',
            duplicateOf,
          },
        });
        continue;
      }
      seenIdentityRefs.set(rawIdentity.identityHash, createRawSeenIdentityRef(rawCandidate));

      const stored = await state.dependencies.ingestCandidate({
        userId: state.userId,
        sourcePlatform: state.request.platform,
        rawCandidate,
      });
      const storedIdentityRef = createStoredSeenIdentityRef(rawCandidate, stored);
      const candidateWasExisting = stored.candidateWasExisting === true;
      const resumeWasExisting = stored.resumeWasExisting === true;

      if (
        stored.identityHash !== rawIdentity.identityHash &&
        !dedupe.markSeen(stored.identityHash)
      ) {
        const duplicateOf = seenIdentityRefs.get(stored.identityHash) ?? null;
        stats.deduped += 1;
        await recordRunEvent({
          dependencies: state.dependencies,
          userId: state.userId,
          runId: state.runId,
          jobDescriptionId: state.jobDescription.id,
          candidateId: stored.candidateId,
          stage: 'indexing_resumes',
          level: 'warning',
          message: `跳过重复候选人：${rawCandidate.name}`,
          detail: {
            candidateName: rawCandidate.name,
            candidateId: stored.candidateId,
            resumeId: stored.resumeId,
            dedupeBy: 'stored_identity',
            duplicateOf,
          },
        });
        continue;
      }
      seenIdentityRefs.set(rawIdentity.identityHash, storedIdentityRef);
      seenIdentityRefs.set(stored.identityHash, storedIdentityRef);

      if (candidateWasExisting) {
        stats.deduped += 1;
      } else {
        stats.stored += 1;
      }
      await recordRunEvent({
        dependencies: state.dependencies,
        userId: state.userId,
        runId: state.runId,
        jobDescriptionId: state.jobDescription.id,
        candidateId: stored.candidateId,
        stage: 'indexing_resumes',
        level: candidateWasExisting ? 'warning' : 'success',
        message: candidateWasExisting
          ? `复用已有候选人：${rawCandidate.name}`
          : `候选人入库：${rawCandidate.name}`,
        detail: {
          candidateName: rawCandidate.name,
          candidateId: stored.candidateId,
          resumeId: stored.resumeId,
          chunkCount: stored.chunkCount,
          candidateWasExisting,
          resumeWasExisting,
          existingCandidateId: stored.existingCandidateId ?? null,
          existingCandidateName: stored.existingCandidateName ?? null,
          existingResumeId: stored.existingResumeId ?? null,
          dedupeBy: candidateWasExisting ? 'existing_candidate_identity' : null,
          duplicateOf: candidateWasExisting
            ? {
                candidateName: stored.existingCandidateName ?? rawCandidate.name,
                candidateId: stored.existingCandidateId ?? stored.candidateId,
                resumeId: stored.existingResumeId ?? stored.resumeId,
                profileUrl: rawCandidate.profileUrl ?? null,
                platformCandidateId: rawCandidate.platformCandidateId ?? null,
              }
            : null,
          title: rawCandidate.title ?? null,
          company: rawCandidate.company ?? null,
          location: rawCandidate.location ?? null,
          profileUrl: rawCandidate.profileUrl ?? null,
        },
      });
      contexts.set(stored.candidateId, {
        candidateId: stored.candidateId,
        resumeId: stored.resumeId,
        resumeText: rawCandidate.resumeText,
        displayName: rawCandidate.name,
        profileUrl: rawCandidate.profileUrl ?? null,
        contacted: stored.candidateContacted === true,
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

    const topK = resolveVectorRecallTopK(state.request.maxCandidates);
    const recalledCandidates = await state.dependencies.recallCandidates({
      userId: state.userId,
      retrievalQuery: searchPlan.retrievalQuery,
      topK,
      allowAlreadyContacted: state.request.allowAlreadyContacted,
    });
    stats.vectorRecalled = recalledCandidates.length;
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'recalling_vectors',
      level: 'success',
      message: `向量召回完成：${recalledCandidates.length} 人`,
      detail: {
        retrievalQuery: searchPlan.retrievalQuery,
        topK,
        recalled: recalledCandidates.length,
      },
    });
    for (const candidate of recalledCandidates) {
      await recordRunEvent({
        dependencies: state.dependencies,
        userId: state.userId,
        runId: state.runId,
        jobDescriptionId: state.jobDescription.id,
        candidateId: candidate.candidateId,
        stage: 'recalling_vectors',
        message: `召回候选人：${candidate.displayName}`,
        detail: {
          candidateName: candidate.displayName,
          candidateId: candidate.candidateId,
          resumeId: candidate.resumeId,
          chunkIndex: candidate.chunkIndex,
          matchScore: candidate.score,
          contentPreview: candidate.content.slice(0, 140),
        },
      });
    }

    const vectorInputResult = buildVectorInputs({
      recalledCandidates,
      contexts,
      platform: state.request.platform,
    });
    stats.skipped += vectorInputResult.skipped.length;
    for (const skipped of vectorInputResult.skipped) {
      await recordRunEvent({
        dependencies: state.dependencies,
        userId: state.userId,
        runId: state.runId,
        jobDescriptionId: state.jobDescription.id,
        candidateId: skipped.candidate.candidateId,
        stage: 'recalling_vectors',
        level: 'warning',
        message: `跳过无效召回候选人：${skipped.candidate.displayName}`,
        detail: {
          candidateName: skipped.candidate.displayName,
          candidateId: skipped.candidate.candidateId,
          resumeId: skipped.candidate.resumeId,
          profileUrl: skipped.candidate.profileUrl ?? null,
          reason: skipped.reason,
        },
      });
    }

    return {
      contexts,
      vectorInputs: vectorInputResult.inputs,
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

    const evaluationCandidates = selectEvaluationCandidates({
      liveInputs: state.liveInputs,
      vectorInputs: state.vectorInputs,
      contexts: state.contexts,
      maxCandidates: state.request.maxCandidates,
      mergeAndRank: state.dependencies.mergeAndRank,
    });
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'evaluating',
      message: `合并候选池：准备评估 ${evaluationCandidates.length} 人`,
      detail: {
        limit: resolveEvaluationLimit(state.request.maxCandidates),
        liveCandidates: state.liveInputs.length,
        vectorCandidates: state.vectorInputs.length,
        selectedCandidates: evaluationCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          candidateName: state.contexts.get(candidate.candidateId)?.displayName ?? null,
          rank: candidate.rank,
          source: candidate.source,
          matchScore: candidate.matchScore,
        })),
      },
    });

    const evaluations = await evaluateCandidates({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      contexts: selectEvaluationContexts(state.contexts, evaluationCandidates),
      jobDescription: state.jobDescription,
      evaluationSchema: requireEvaluationSchema(state),
      stats,
      strictEvaluation: state.request.mode === 'execution',
    });
    if (evaluationCandidates.length > 0 && evaluations.size === 0) {
      rememberStats(resources, stats);
      await recordRunEvent({
        dependencies: state.dependencies,
        userId: state.userId,
        runId: state.runId,
        jobDescriptionId: state.jobDescription.id,
        stage: 'evaluating',
        level: 'error',
        message: '评估阶段无可用结果',
        detail: {
          selectedCandidateCount: evaluationCandidates.length,
          evaluated: stats.evaluated,
          failed: stats.failed,
        },
      });
      throw new Error('No candidate evaluations succeeded');
    }

    return {
      candidatePool: evaluationCandidates,
      evaluations,
      stats: rememberStats(resources, stats),
    };
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

    const preliminaryRankedCandidates = state.candidatePool;
    const rankedCandidates = rankEvaluatedCandidates({
      rankedCandidates: preliminaryRankedCandidates,
      evaluations: state.evaluations,
    });
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'ranking',
      level: 'success',
      message: `排序完成：${rankedCandidates.length} 人`,
      detail: {
        sourceCandidateCount: preliminaryRankedCandidates.length,
        rankedCount: rankedCandidates.length,
        candidates: rankedCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          candidateName: state.contexts.get(candidate.candidateId)?.displayName ?? null,
          rank: candidate.rank,
          source: candidate.source,
          matchScore: candidate.matchScore,
          finalScore: state.evaluations.get(candidate.candidateId)?.score.total ?? null,
          action: state.evaluations.get(candidate.candidateId)?.decision.action ?? null,
        })),
      },
    });

    return {
      rankedCandidates,
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
    const workflowSession = resources.workflowSession;
    if (!workflowSession) {
      throw new Error('candidate screening execution requires an initialized workflow session');
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
      executeContactAndCollect: (candidate, actionPlan) =>
        workflowSession.contactAndCollectCandidate(candidate, actionPlan),
      executeCollect: (candidate) => workflowSession.collectCandidate(candidate),
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
    await recordRunEvent({
      dependencies: state.dependencies,
      userId: state.userId,
      runId: state.runId,
      jobDescriptionId: state.jobDescription.id,
      stage: 'finalizing',
      level: 'success',
      message: '筛选任务完成',
      detail: {
        stats: state.stats,
      },
    });
    await state.dependencies.repo.updateRun({
      userId: state.userId,
      runId: state.runId,
      status: 'success',
      currentStage: 'finalizing',
      errorMessage: null,
      finishedAt: new Date(),
      currentWorkflowStep: null,
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
    workflowSession: null,
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
        candidatePool: [],
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
      currentWorkflowStep: null,
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

function getActionLog(
  detail: CandidateScreeningDetailDto,
  action: CandidateDecisionAction,
  runId: string,
): CandidateActionLogDto | null {
  return (
    detail.actionLogs.find(
      (actionLog) => actionLog.runId === runId && actionLog.action === action,
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

function contactAndCollectStatus(executionResult: ActionExecutionResult): {
  contactSucceeded: boolean;
  collectSucceeded: boolean;
} {
  const trace = executionResult.browserTrace;
  const contact = trace?.contact;
  const collect = trace?.collect;
  return {
    contactSucceeded: contact === 'success' || (executionResult.success && contact !== 'failed'),
    collectSucceeded: collect === 'success' || (executionResult.success && collect !== 'failed'),
  };
}

async function persistContactAndCollectExecutionResult(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  result: CandidateScreeningResultListItem;
  actionPlan: CandidateActionPlan;
  chatActionLog: CandidateActionLogDto;
  collectActionLog: CandidateActionLogDto;
  executionResult: ActionExecutionResult;
  stats: ScreeningRunStats;
}): Promise<void> {
  const status = contactAndCollectStatus(params.executionResult);
  if (!status.contactSucceeded) {
    await markExecutionFailed({
      dependencies: params.dependencies,
      userId: params.userId,
      runId: params.runId,
      result: params.result,
      actionPlan: params.actionPlan,
      actionLog: params.chatActionLog,
      errorMessage: params.executionResult.error ?? 'contact execution failed',
      browserTrace: params.executionResult.browserTrace ?? null,
      stats: params.stats,
    });
    await params.dependencies.repo.updateActionLog({
      userId: params.userId,
      id: params.collectActionLog.id,
      status: 'skipped',
      browserTrace: params.executionResult.browserTrace ?? null,
      errorMessage: 'contact was not sent',
    });
    return;
  }

  await persistExecutionResult({
    dependencies: params.dependencies,
    userId: params.userId,
    runId: params.runId,
    result: params.result,
    actionPlan: params.actionPlan,
    actionLog: params.chatActionLog,
    executionResult: { success: true, browserTrace: params.executionResult.browserTrace },
    stats: params.stats,
  });

  if (status.collectSucceeded) {
    await params.dependencies.repo.updateActionLog({
      userId: params.userId,
      id: params.collectActionLog.id,
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
      interviewStage: 'collected',
      notes: params.result.notes,
    });
    return;
  }

  params.stats.failed += 1;
  await params.dependencies.repo.updateActionLog({
    userId: params.userId,
    id: params.collectActionLog.id,
    status: 'failed',
    browserTrace: params.executionResult.browserTrace ?? null,
    errorMessage: params.executionResult.error ?? 'collect execution failed',
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
    interviewStage: 'contacted',
    notes: params.result.notes,
  });
}

async function persistCollectRetryExecutionResult(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  result: CandidateScreeningResultListItem;
  actionPlan: CandidateActionPlan;
  collectActionLog: CandidateActionLogDto;
  executionResult: ActionExecutionResult;
  stats: ScreeningRunStats;
}): Promise<void> {
  if (params.executionResult.success) {
    await params.dependencies.repo.updateActionLog({
      userId: params.userId,
      id: params.collectActionLog.id,
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
      interviewStage: 'collected',
      notes: params.result.notes,
    });
    return;
  }

  params.stats.failed += 1;
  await params.dependencies.repo.updateActionLog({
    userId: params.userId,
    id: params.collectActionLog.id,
    status: 'failed',
    browserTrace: params.executionResult.browserTrace ?? null,
    errorMessage: params.executionResult.error ?? 'collect execution failed',
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
    interviewStage: 'contacted',
    notes: params.result.notes,
  });
}

async function executePlannedActionsForRun(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  executeContactAndCollect: (
    candidate: StoredCandidateRef,
    actionPlan: CandidateActionPlan,
  ) => Promise<ActionExecutionResult>;
  executeCollect: CandidateSourceAdapter['collectCandidate'];
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
    if (!result.actionPlan) {
      continue;
    }

    const isRetryingCollect =
      result.actionPlan.action === 'chat' && result.actionStatus === 'failed';
    if (
      !isRetryingCollect &&
      !shouldExecuteAction({
        result,
        chatCount,
        collectCount,
        request: params.request,
      })
    ) {
      continue;
    }

    const detail = await params.dependencies.repo.getDetail({
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: result.candidateId,
    });
    if (!detail) continue;

    if (isRetryingCollect) {
      const chatActionLog = getActionLog(detail, 'chat', params.runId);
      const collectActionLog = getActionLog(detail, 'collect', params.runId);
      if (
        chatActionLog?.status !== 'success' ||
        collectActionLog?.status !== 'failed' ||
        collectCount >= params.request.maxCollectActions
      ) {
        continue;
      }
      const claimedCollectLog = await params.dependencies.repo.claimRetryableCollectActionLog({
        userId: params.userId,
        id: collectActionLog.id,
      });
      if (!claimedCollectLog) continue;

      try {
        const executionResult = await params.executeCollect(createStoredCandidateRef(result));
        await persistCollectRetryExecutionResult({
          dependencies: params.dependencies,
          userId: params.userId,
          runId: params.runId,
          result,
          actionPlan: result.actionPlan,
          collectActionLog: claimedCollectLog,
          executionResult,
          stats: params.stats,
        });
        collectCount += 1;
      } catch (error) {
        await persistCollectRetryExecutionResult({
          dependencies: params.dependencies,
          userId: params.userId,
          runId: params.runId,
          result,
          actionPlan: result.actionPlan,
          collectActionLog: claimedCollectLog,
          executionResult: { success: false, error: getErrorMessage(error) },
          stats: params.stats,
        });
      }
      continue;
    }

    const actionLog = getPlannedActionLog(detail, result.actionPlan.action, params.runId);
    if (!actionLog) continue;

    const claimedActionLog = await params.dependencies.repo.claimActionLog({
      userId: params.userId,
      id: actionLog.id,
    });
    if (!claimedActionLog) continue;

    try {
      const storedCandidate = createStoredCandidateRef(result);
      await recordRunEvent({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: result.candidateId,
        stage: 'executing_actions',
        message: `执行动作：${result.candidate.displayName}`,
        detail: {
          candidateName: result.candidate.displayName,
          action: result.actionPlan.action,
          actionMessage: result.actionPlan.message ?? null,
          priority: result.actionPlan.priority,
        },
      });
      const collectActionLog =
        result.actionPlan.action === 'chat' ? getActionLog(detail, 'collect', params.runId) : null;
      const executionResult =
        result.actionPlan.action === 'chat'
          ? await params.executeContactAndCollect(storedCandidate, result.actionPlan)
          : await params.executeCollect(storedCandidate);

      if (result.actionPlan.action === 'chat' && collectActionLog) {
        await persistContactAndCollectExecutionResult({
          dependencies: params.dependencies,
          userId: params.userId,
          runId: params.runId,
          result,
          actionPlan: result.actionPlan,
          chatActionLog: claimedActionLog,
          collectActionLog,
          executionResult,
          stats: params.stats,
        });
      } else {
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
      }
      await recordRunEvent({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: result.candidateId,
        stage: 'executing_actions',
        level: executionResult.success ? 'success' : 'error',
        message: executionResult.success
          ? `动作执行成功：${result.candidate.displayName}`
          : `动作执行失败：${result.candidate.displayName}`,
        detail: {
          candidateName: result.candidate.displayName,
          action: result.actionPlan.action,
          actionMessage: result.actionPlan.message ?? null,
          errorMessage: executionResult.error ?? null,
          browserTrace: executionResult.browserTrace ?? null,
        },
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
      await recordRunEvent({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescriptionId,
        candidateId: result.candidateId,
        stage: 'executing_actions',
        level: 'error',
        message: `动作执行失败：${result.candidate.displayName}`,
        detail: {
          candidateName: result.candidate.displayName,
          action: result.actionPlan.action,
          actionMessage: result.actionPlan.message ?? null,
          errorMessage: getErrorMessage(error),
        },
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
  let workflowSession: CandidateScreeningWorkflowSession | null = null;

  async function getLegacyAdapterAfterClaim(): Promise<CandidateSourceAdapter> {
    if (adapter) {
      return adapter;
    }

    const nextAdapter = dependencies.createAdapter(currentRun.platform, {
      userId: params.userId,
    });
    try {
      await nextAdapter.loginIfNeeded();
    } catch (error) {
      await closeAdapterSafely(nextAdapter);
      throw error;
    }
    adapter = nextAdapter;
    return adapter;
  }

  async function getWorkflowSessionAfterClaim(): Promise<CandidateScreeningWorkflowSession> {
    if (workflowSession) {
      return workflowSession;
    }
    if (currentRun.skillId === null) {
      throw new Error('stored workflow skill id is required for workflow execution');
    }

    const nextAdapter = dependencies.createAdapter(currentRun.platform, {
      userId: params.userId,
    });
    const nextWorkflowSession = dependencies.createWorkflowSession({
      adapter: nextAdapter,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: currentRun.jobDescriptionId,
      platform: currentRun.platform,
      repo: dependencies.repo,
    });
    try {
      await nextWorkflowSession.loadExact({
        skillId: currentRun.skillId,
        stage: 'executing_actions',
      });
    } catch (error) {
      await closeAdapterSafely(nextAdapter);
      throw error;
    }
    adapter = nextAdapter;
    workflowSession = nextWorkflowSession;
    return workflowSession;
  }

  const executeContactAndCollect = async (
    candidate: StoredCandidateRef,
    actionPlan: CandidateActionPlan,
  ): Promise<ActionExecutionResult> => {
    if (currentRun.skillId === null) {
      const legacyAdapter = await getLegacyAdapterAfterClaim();
      const contact = await legacyAdapter.chatCandidate(candidate, actionPlan);
      if (!contact.success) {
        return {
          ...contact,
          browserTrace: { contact: 'failed', collect: 'not_attempted' },
        };
      }
      const collect = await legacyAdapter.collectCandidate(candidate);
      return {
        success: collect.success,
        error: collect.error,
        browserTrace: {
          contact: 'success',
          collect: collect.success ? 'success' : 'failed',
        },
      };
    }
    const session = await getWorkflowSessionAfterClaim();
    return session.contactAndCollectCandidate(candidate, actionPlan);
  };

  const executeCollect: CandidateSourceAdapter['collectCandidate'] = async (candidate) => {
    if (currentRun.skillId === null) {
      const legacyAdapter = await getLegacyAdapterAfterClaim();
      return legacyAdapter.collectCandidate(candidate);
    }
    const session = await getWorkflowSessionAfterClaim();
    return session.collectCandidate(candidate);
  };

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
      executeContactAndCollect,
      executeCollect,
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
      currentWorkflowStep: null,
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
      currentWorkflowStep: null,
      stats: copyStats(stats),
    });
  } finally {
    await closeAdapterSafely(adapter);
  }
}

export async function executeSingleCandidateAction(params: {
  runId: string;
  userId: string;
  jobDescriptionId: string;
  candidateId: string;
  dependencies?: ScreeningRunnerDependencyOverrides;
}): Promise<ExecuteSingleCandidateActionResult> {
  const dependencies = resolveDependencies(params.dependencies);
  const run = await dependencies.repo.getRun({ userId: params.userId, runId: params.runId });
  if (!run) {
    throw new Error('candidate screening run not found');
  }

  const detail = await dependencies.repo.getDetail({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    candidateId: params.candidateId,
  });
  if (!detail) {
    throw new Error('candidate screening detail not found');
  }

  const actionPlan = detail.actionPlan;
  if (!actionPlan || actionPlan.action !== 'chat') {
    throw new Error('candidate does not have a planned chat action');
  }

  const actionLog = getPlannedActionLog(detail, actionPlan.action, params.runId);
  if (!actionLog) {
    throw new Error('candidate has no planned chat action for this run');
  }

  const claimedActionLog = await dependencies.repo.claimActionLog({
    userId: params.userId,
    id: actionLog.id,
  });
  if (!claimedActionLog) {
    throw new Error('candidate planned chat action is already running or finished');
  }
  const collectActionLog = getActionLog(detail, 'collect', params.runId);

  const stats = createEmptyStats();
  let adapter: CandidateSourceAdapter | null = null;
  try {
    const nextAdapter = dependencies.createAdapter(run.platform, {
      userId: params.userId,
    });
    adapter = nextAdapter;
    const storedCandidate = createStoredCandidateRef(detail);
    let executionResult: ActionExecutionResult;
    if (run.skillId === null) {
      await nextAdapter.loginIfNeeded();
      executionResult = await nextAdapter.chatCandidate(storedCandidate, actionPlan);
    } else {
      const workflowSession = dependencies.createWorkflowSession({
        adapter: nextAdapter,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescriptionId,
        platform: run.platform,
        repo: dependencies.repo,
      });
      await workflowSession.loadExact({
        skillId: run.skillId,
        stage: 'executing_actions',
      });
      executionResult = await workflowSession.contactAndCollectCandidate(
        storedCandidate,
        actionPlan,
      );
    }

    if (collectActionLog) {
      await persistContactAndCollectExecutionResult({
        dependencies,
        userId: params.userId,
        runId: params.runId,
        result: detail,
        actionPlan,
        chatActionLog: claimedActionLog,
        collectActionLog,
        executionResult,
        stats,
      });
      if (!executionResult.success) {
        return {
          status: 'failed',
          candidateId: params.candidateId,
          candidateName: detail.candidate.displayName,
          detail: executionResult.error ?? '单点沟通或收藏失败',
          errorMessage: executionResult.error ?? 'action execution failed',
        };
      }
      return {
        status: 'success',
        candidateId: params.candidateId,
        candidateName: detail.candidate.displayName,
        detail: '已发送单点沟通消息并收藏候选人',
        errorMessage: null,
      };
    }

    if (!executionResult.success) {
      await markExecutionFailed({
        dependencies,
        userId: params.userId,
        runId: params.runId,
        result: detail,
        actionPlan,
        actionLog: claimedActionLog,
        errorMessage: executionResult.error ?? 'action execution failed',
        browserTrace: executionResult.browserTrace ?? null,
        stats,
      });
      return {
        status: 'failed',
        candidateId: params.candidateId,
        candidateName: detail.candidate.displayName,
        detail: executionResult.error ?? '单点沟通发送失败',
        errorMessage: executionResult.error ?? 'action execution failed',
      };
    }

    await persistExecutionResult({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      result: detail,
      actionPlan,
      actionLog: claimedActionLog,
      executionResult,
      stats,
    });
    return {
      status: 'success',
      candidateId: params.candidateId,
      candidateName: detail.candidate.displayName,
      detail: '已发送单点沟通消息',
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await dependencies.repo
      .updateRun({
        userId: params.userId,
        runId: params.runId,
        currentWorkflowStep: null,
      })
      .catch(() => undefined);
    await markExecutionFailed({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      result: detail,
      actionPlan,
      actionLog: claimedActionLog,
      errorMessage,
      stats,
    });
    return {
      status: 'failed',
      candidateId: params.candidateId,
      candidateName: detail.candidate.displayName,
      detail: errorMessage,
      errorMessage,
    };
  } finally {
    await closeAdapterSafely(adapter);
  }
}
