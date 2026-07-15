/** @jest-environment node */

import type { CandidateSourceAdapter, RawCandidateBatch } from './adapters/types';
import type { RawCandidate } from './ingest';
import { buildCalibrationProfileFromJd, buildScoringQualityPolicy } from './calibration';
import type {
  CandidateActionLogDto,
  CandidateScreeningDetailDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunDto,
} from './repo';
import type {
  CandidateActionPlan,
  CandidateTags,
  CreateScreeningRunRequest,
  EvaluationSchema,
  ExecuteActionsRequest,
  ScoreDetail,
  SearchPlan,
  ScreeningRunStats,
} from './types';
import { createActionIdempotencyKey, createDryRunActionPlan } from './actions';
import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
} from './constants';
import {
  executeSingleCandidateAction,
  executeScreeningRunActions,
  runCandidateScreeningGraph,
  runCandidateScreening,
  type ScreeningRunnerDependencies,
} from './runner';
import { buildBossLikeScreeningSkill } from './workflow/skill-registry';
import type { CandidateScreeningWorkflowSession } from './workflow/executor';
import type { ScreeningWorkflowSkill } from './workflow/types';
import type { JobDescriptionDto } from '@/types';

const createdAt = '2026-06-01T00:00:00.000Z';
const updatedAt = '2026-06-01T00:00:00.000Z';

const searchPlan: SearchPlan = {
  keywords: ['frontend'],
  filters: { location: 'Shanghai' },
  priorityTags: ['React'],
  retrievalQuery: 'frontend react',
};

const evaluationSchema: EvaluationSchema = {
  skills: ['React'],
  domainKnowledge: ['SaaS'],
  generalAbility: ['communication'],
  risk: ['job hopping'],
};

const tags: CandidateTags = {
  skills: ['React'],
  domainKnowledge: [],
  generalAbility: [],
  risk: [],
  activity: [],
  custom: [],
};

const score: ScoreDetail = {
  skill: 90,
  domain: 80,
  ability: 85,
  risk: 10,
  llmBonus: 5,
  total: 88,
  promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
  scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
  calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
  qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
};

const chatDecision: CandidateActionPlan = {
  action: 'chat',
  priority: 'high',
  message: 'chat candidate',
  reason: 'strong match',
};

const collectDecision: CandidateActionPlan = {
  action: 'collect',
  priority: 'medium',
  message: null,
  reason: 'needs resume',
};

const skipDecision: CandidateActionPlan = {
  action: 'skip',
  priority: 'low',
  message: null,
  reason: 'not relevant',
};

const request: CreateScreeningRunRequest = {
  platform: 'boss-like',
  mode: 'dry_run',
  maxCandidates: 20,
  batchSize: 10,
  allowAlreadyContacted: false,
};

const executeRequest: ExecuteActionsRequest = {
  confirmExecution: true,
  maxChatActions: 2,
  maxCollectActions: 2,
};

const jobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'user-1',
  department: 'Engineering',
  position: 'Frontend Engineer',
  positionDescription: 'Build hiring workflows',
  salaryRange: null,
  workLocations: [],
  tone: 'formal',
  status: 'created',
  content: {
    title: 'Frontend Engineer',
    summary: 'Build modern UIs',
    responsibilities: ['Build React apps'],
    requirements: ['React'],
    highlights: ['AI workflow'],
    bonus: ['Next.js'],
  },
  evaluation: null,
  generationMeta: null,
  createdAt,
  updatedAt,
};

function emptyStats(overrides: Partial<ScreeningRunStats> = {}): ScreeningRunStats {
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
    ...overrides,
  };
}

function makeRun(overrides: Partial<CandidateScreeningRunDto> = {}): CandidateScreeningRunDto {
  return {
    id: 'run-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like',
    mode: 'dry_run',
    status: 'pending',
    currentStage: null,
    skillId: null,
    workflow: null,
    currentWorkflowStep: null,
    searchPlan: null,
    evaluationSchema: null,
    stats: emptyStats(),
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function makeRawCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    platformCandidateId: 'platform-candidate-1',
    name: 'Ada Lovelace',
    title: 'Senior Frontend Engineer',
    company: 'Analytical Engines',
    location: 'Shanghai',
    experienceYears: 6,
    resumeText: 'React TypeScript platform work',
    profileUrl: 'https://example.com/ada',
    lastActiveAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeVectorRecallCandidate(overrides: Record<string, unknown> = {}) {
  const candidateId =
    typeof overrides.candidateId === 'string' ? overrides.candidateId : 'candidate-vector';
  const displayName =
    typeof overrides.displayName === 'string' ? overrides.displayName : 'Grace Hopper';

  return {
    id: `chunk-${candidateId}`,
    candidateId,
    resumeId: `resume-${candidateId}`,
    userId: 'user-1',
    chunkIndex: 0,
    content: 'React SaaS search workflow',
    displayName,
    currentTitle: 'Staff Engineer',
    currentCompany: 'Compilers Inc',
    profileUrl: '/employer/resumes/1',
    contacted: false,
    score: 0.82,
    ...overrides,
  };
}

async function* batches(...items: RawCandidateBatch[]): AsyncIterable<RawCandidateBatch> {
  for (const item of items) {
    yield item;
  }
}

function makeAdapter(
  overrides: Partial<CandidateSourceAdapter> = {},
): jest.Mocked<CandidateSourceAdapter> {
  return {
    platform: 'boss-like',
    loginIfNeeded: jest.fn().mockResolvedValue(undefined),
    searchCandidates: jest.fn(() => batches({ candidates: [] })),
    enrichCandidate: jest.fn().mockImplementation(async (candidate) => candidate),
    collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    chatCandidate: jest.fn().mockResolvedValue({ success: true }),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<CandidateSourceAdapter>;
}

function makeWorkflowSkill(
  overrides: Partial<ScreeningWorkflowSkill> = {},
): ScreeningWorkflowSkill {
  return {
    ...buildBossLikeScreeningSkill(),
    id: 'screen-v1',
    ...overrides,
  };
}

function makeWorkflowSession(
  adapter: CandidateSourceAdapter,
  overrides: Partial<CandidateScreeningWorkflowSession> = {},
): jest.Mocked<CandidateScreeningWorkflowSession> {
  const skill = overrides.skill ?? makeWorkflowSkill();

  return {
    skill,
    loadOrExplore: jest.fn().mockImplementation(async () => {
      await adapter.loginIfNeeded();
      return skill;
    }),
    loadExact: jest.fn().mockImplementation(async () => {
      await adapter.loginIfNeeded();
      return skill;
    }),
    runSearchKeyword: jest.fn().mockImplementation(async ({ keyword, maxCandidates }) => {
      const candidates: RawCandidate[] = [];
      for await (const batch of adapter.searchCandidates(
        { ...searchPlan, keywords: [keyword] },
        { maxCandidates, batchSize: request.batchSize },
      )) {
        candidates.push(...batch.candidates);
      }
      return { keyword, candidates: candidates.slice(0, maxCandidates) };
    }),
    observeCandidateProfile: jest
      .fn()
      .mockImplementation((candidate) => adapter.enrichCandidate(candidate)),
    contactAndCollectCandidate: jest.fn().mockResolvedValue({ success: true }),
    collectCandidate: jest.fn((candidate) => adapter.collectCandidate(candidate)),
    close: jest.fn(() => adapter.close()),
    ...overrides,
  } as jest.Mocked<CandidateScreeningWorkflowSession>;
}

function makeResult(
  overrides: Partial<CandidateScreeningResultListItem> = {},
): CandidateScreeningResultListItem {
  return {
    id: 'result-1',
    userId: 'user-1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    resumeId: 'resume-1',
    source: 'live_search',
    tags,
    scoreDetail: score,
    finalScore: 88,
    rank: 1,
    decisionAction: 'chat',
    decisionPriority: 'high',
    decisionReason: 'strong match',
    actionPlan: chatDecision,
    actionStatus: 'planned',
    interviewStage: 'to_contact',
    notes: null,
    createdAt,
    updatedAt,
    candidate: {
      id: 'candidate-1',
      userId: 'user-1',
      displayName: 'Ada Lovelace',
      currentTitle: 'Senior Frontend Engineer',
      currentCompany: 'Analytical Engines',
      location: 'Shanghai',
      experienceYears: 6,
      sourcePlatform: 'boss-like',
      platformCandidateId: 'platform-candidate-1',
      profileUrl: 'https://example.com/ada',
      identityKey: 'identity-key-1',
      identityHash: 'identity-hash-1',
      lastActiveAt: null,
      contacted: false,
      replied: false,
      lastContactAt: null,
      createdAt,
      updatedAt,
    },
    resume: {
      id: 'resume-1',
      userId: 'user-1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.com/ada',
      rawText: 'React TypeScript platform work',
      structuredSummary: null,
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
      createdAt,
    },
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<CandidateScreeningDetailDto> = {},
): CandidateScreeningDetailDto {
  const result = makeResult(overrides);
  return {
    ...result,
    actionLogs: [
      {
        id: 'action-log-1',
        userId: 'user-1',
        runId: 'run-1',
        screeningResultId: result.id,
        candidateId: result.candidateId,
        jobDescriptionId: result.jobDescriptionId,
        platform: 'boss-like',
        mode: 'dry_run',
        action: 'chat',
        message: 'chat candidate',
        status: 'planned',
        idempotencyKey: 'existing-idempotency-key',
        browserTrace: null,
        errorMessage: null,
        createdAt,
        updatedAt,
      },
    ],
    ...overrides,
  };
}

function makePlannedActionLog(
  result: CandidateScreeningResultListItem,
  actionPlan: CandidateActionPlan,
): CandidateActionLogDto {
  return {
    id: `action-log-${result.candidateId}`,
    userId: 'user-1',
    runId: 'run-1',
    screeningResultId: result.id,
    candidateId: result.candidateId,
    jobDescriptionId: result.jobDescriptionId,
    platform: 'boss-like',
    mode: 'execution',
    action: actionPlan.action,
    message: actionPlan.message,
    status: 'planned',
    idempotencyKey: `execution-${result.candidateId}`,
    browserTrace: null,
    errorMessage: null,
    createdAt,
    updatedAt,
  };
}

function makeDependencies(adapter = makeAdapter()): ScreeningRunnerDependencies & {
  adapter: jest.Mocked<CandidateSourceAdapter>;
  createWorkflowSession: jest.Mock;
} {
  return {
    adapter,
    buildPlan: jest.fn().mockReturnValue({ searchPlan, evaluationSchema }),
    createAdapter: jest.fn().mockReturnValue(adapter),
    createWorkflowSession: jest
      .fn()
      .mockImplementation(({ adapter: sessionAdapter }: { adapter: CandidateSourceAdapter }) =>
        makeWorkflowSession(sessionAdapter),
      ),
    ingestCandidate: jest.fn().mockResolvedValue({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: 'identity-hash-1',
      chunkCount: 2,
    }),
    recallCandidates: jest.fn().mockResolvedValue([]),
    evaluateCandidate: jest.fn().mockResolvedValue({
      tags,
      score,
      decision: chatDecision,
    }),
    mergeAndRank: jest
      .fn()
      .mockReturnValue([
        { candidateId: 'candidate-1', matchScore: 0.97, source: 'live_search', rank: 1 },
      ]),
    repo: {
      getRun: jest.fn().mockResolvedValue(makeRun()),
      updateRun: jest.fn().mockResolvedValue(makeRun()),
      upsertResult: jest.fn().mockResolvedValue(makeResult()),
      createActionLog: jest.fn().mockResolvedValue({
        id: 'action-log-1',
        userId: 'user-1',
        runId: 'run-1',
        screeningResultId: 'result-1',
        candidateId: 'candidate-1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        mode: 'dry_run',
        action: 'chat',
        message: 'chat candidate',
        status: 'planned',
        idempotencyKey: 'idempotency-key-1',
        browserTrace: null,
        errorMessage: null,
        createdAt,
        updatedAt,
      }),
      updateActionLog: jest.fn().mockResolvedValue(null),
      createRunEvent: jest.fn().mockResolvedValue({
        id: 'event-1',
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: null,
        stage: 'planning',
        level: 'info',
        message: 'event',
        detail: null,
        createdAt,
      }),
      listResults: jest.fn().mockResolvedValue([]),
      getDetail: jest.fn().mockResolvedValue(null),
      upsertCandidate: jest.fn().mockResolvedValue(makeResult().candidate),
      claimActionLog: jest.fn().mockResolvedValue(null),
      claimRetryableCollectActionLog: jest.fn().mockResolvedValue(null),
      listRunEvents: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('candidate screening runner', () => {
  it('exposes a LangGraph screening runner entrypoint', () => {
    expect(runCandidateScreeningGraph).toBe(runCandidateScreening);
  });

  it('loads a screening workflow before live search and stores its skill id', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      skill: makeWorkflowSkill({ id: 'screen-v1' }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(workflow.loadOrExplore).toHaveBeenCalledWith({
      searchPlan,
      stage: 'searching_live',
    });
    expect(workflow.runSearchKeyword).toHaveBeenCalledWith({
      keyword: 'frontend',
      maxCandidates: 20,
    });
    expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'screen-v1' }),
    );
  });

  it('runs one search segment per keyword and observes each globally unique profile once', async () => {
    const adapter = makeAdapter();
    const ada = makeRawCandidate({
      platformCandidateId: 'ada',
      name: 'Ada Lovelace',
      profileUrl: 'https://example.com/ada',
      resumeText: 'list summary only',
    });
    const grace = makeRawCandidate({
      platformCandidateId: 'grace',
      name: 'Grace Hopper',
      profileUrl: 'https://example.com/grace',
      resumeText: 'list summary only',
    });
    const workflow = makeWorkflowSession(adapter, {
      runSearchKeyword: jest
        .fn()
        .mockResolvedValueOnce({ keyword: 'Java', candidates: [ada, grace] })
        .mockResolvedValueOnce({ keyword: 'PostgreSQL', candidates: [ada] }),
      observeCandidateProfile: jest.fn().mockImplementation(async (candidate) => ({
        ...candidate,
        resumeText: `${candidate.name} full profile`,
      })),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.buildPlan = jest.fn().mockReturnValue({
      searchPlan: { ...searchPlan, keywords: ['Java', 'PostgreSQL'] },
      evaluationSchema,
    });
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    dependencies.ingestCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate-ada',
        resumeId: 'resume-ada',
        identityHash: 'identity-ada',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-grace',
        resumeId: 'resume-grace',
        identityHash: 'identity-grace',
        chunkCount: 1,
      });
    dependencies.mergeAndRank = jest.fn().mockReturnValue([
      { candidateId: 'candidate-ada', matchScore: 1, source: 'live_search', rank: 1 },
      { candidateId: 'candidate-grace', matchScore: 1, source: 'live_search', rank: 2 },
    ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 3 },
      dependencies,
    });

    expect(workflow.runSearchKeyword).toHaveBeenNthCalledWith(1, {
      keyword: 'Java',
      maxCandidates: 3,
    });
    expect(workflow.runSearchKeyword).toHaveBeenNthCalledWith(2, {
      keyword: 'PostgreSQL',
      maxCandidates: 1,
    });
    expect(workflow.observeCandidateProfile).toHaveBeenCalledTimes(2);
    expect(workflow.observeCandidateProfile).toHaveBeenNthCalledWith(1, ada);
    expect(workflow.observeCandidateProfile).toHaveBeenNthCalledWith(2, grace);
    expect(dependencies.ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        rawCandidate: expect.objectContaining({ resumeText: 'Ada Lovelace full profile' }),
      }),
    );
  });

  it('observes a profile before evaluating it and never contacts an AI-rejected candidate', async () => {
    const adapter = makeAdapter();
    const listCandidate = makeRawCandidate({ resumeText: 'list summary only' });
    const detailedCandidate = makeRawCandidate({ resumeText: 'full profile: Java and PostgreSQL' });
    const workflow = makeWorkflowSession(adapter, {
      runSearchKeyword: jest
        .fn()
        .mockResolvedValue({ keyword: 'Java', candidates: [listCandidate] }),
      observeCandidateProfile: jest.fn().mockResolvedValue(detailedCandidate),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.buildPlan = jest.fn().mockReturnValue({
      searchPlan: { ...searchPlan, keywords: ['Java'] },
      evaluationSchema,
    });
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    dependencies.evaluateCandidate = jest.fn().mockResolvedValue({
      tags,
      score,
      decision: skipDecision,
    });

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution', maxCandidates: 1 },
      dependencies,
    });

    expect(workflow.observeCandidateProfile).toHaveBeenCalledWith(listCandidate);
    expect(dependencies.ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ rawCandidate: detailedCandidate }),
    );
    expect(workflow.contactAndCollectCandidate).not.toHaveBeenCalled();
    expect(workflow.collectCandidate).not.toHaveBeenCalled();
  });

  it('does not mark a search keyword completed before every discovered profile is observed', async () => {
    const adapter = makeAdapter();
    const listCandidate = makeRawCandidate({ resumeText: 'list summary only' });
    const workflow = makeWorkflowSession(adapter, {
      runSearchKeyword: jest
        .fn()
        .mockResolvedValue({ keyword: 'Java', candidates: [listCandidate] }),
      observeCandidateProfile: jest.fn().mockRejectedValue(new Error('profile page crashed')),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.buildPlan = jest.fn().mockReturnValue({
      searchPlan: { ...searchPlan, keywords: ['Java'] },
      evaluationSchema,
    });
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 1 },
      dependencies,
    });

    expect(dependencies.repo.createRunEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'search_keyword_completed',
        detail: expect.objectContaining({ keyword: 'Java' }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'profile page crashed' }),
    );
  });

  it('does not re-search a keyword already recorded as completed for this run', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      runSearchKeyword: jest
        .fn()
        .mockResolvedValue({ keyword: 'PostgreSQL', candidates: [makeRawCandidate()] }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.buildPlan = jest.fn().mockReturnValue({
      searchPlan: { ...searchPlan, keywords: ['Java', 'PostgreSQL'] },
      evaluationSchema,
    });
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    (dependencies.repo as typeof dependencies.repo & { listRunEvents: jest.Mock }).listRunEvents =
      jest
        .fn()
        .mockResolvedValue([
          { message: 'search_keyword_completed', detail: { keyword: 'Java', candidates: [] } },
        ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 2 },
      dependencies,
    });

    expect(workflow.runSearchKeyword).toHaveBeenCalledTimes(1);
    expect(workflow.runSearchKeyword).toHaveBeenCalledWith({
      keyword: 'PostgreSQL',
      maxCandidates: 2,
    });
  });

  it('rehydrates a completed keyword checkpoint when the previous run crashed before ingest', async () => {
    const adapter = makeAdapter();
    const checkpointCandidate = makeRawCandidate({ resumeText: 'list summary only' });
    const detailedCandidate = makeRawCandidate({ resumeText: 'full profile from the real page' });
    const workflow = makeWorkflowSession(adapter, {
      runSearchKeyword: jest.fn().mockRejectedValue(new Error('must not repeat completed search')),
      observeCandidateProfile: jest.fn().mockResolvedValue(detailedCandidate),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.buildPlan = jest.fn().mockReturnValue({
      searchPlan: { ...searchPlan, keywords: ['Java'] },
      evaluationSchema,
    });
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    (dependencies.repo as typeof dependencies.repo & { listRunEvents: jest.Mock }).listRunEvents =
      jest.fn().mockResolvedValue([
        {
          message: 'search_keyword_completed',
          detail: { keyword: 'Java', candidates: [checkpointCandidate] },
        },
      ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 1 },
      dependencies,
    });

    expect(workflow.runSearchKeyword).not.toHaveBeenCalled();
    expect(workflow.observeCandidateProfile).toHaveBeenCalledWith(checkpointCandidate);
    expect(dependencies.ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ rawCandidate: detailedCandidate }),
    );
  });

  it('finishes successfully with zero fetched candidates when first workflow exploration has no usable detail', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      skill: null,
      loadOrExplore: jest.fn().mockResolvedValue(null),
      runSearchKeyword: jest.fn().mockRejectedValue(new Error('must not search without a skill')),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        stats: expect.objectContaining({ fetched: 0 }),
      }),
    );
    expect(dependencies.repo.updateRun).not.toHaveBeenCalledWith(
      expect.objectContaining({ skillId: expect.any(String) }),
    );
    expect(workflow.runSearchKeyword).not.toHaveBeenCalled();
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'searching_live',
        level: 'success',
        message: '实时搜索完成：抓取 0 人',
        detail: expect.objectContaining({ fetched: 0 }),
      }),
    );
  });

  it('uses the same workflow session for planned chat and collect actions', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      contactAndCollectCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { contact: 'success', collect: 'success' },
      }),
      collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const chatCandidate = {
      ...makeResult().candidate,
      id: 'candidate-chat',
      displayName: 'Ada Lovelace',
      profileUrl: 'https://example.com/ada',
    };
    const collectCandidate = {
      ...makeResult().candidate,
      id: 'candidate-collect',
      displayName: 'Grace Hopper',
      profileUrl: 'https://example.com/grace',
    };
    const chatResult = makeResult({
      id: 'result-chat',
      candidateId: 'candidate-chat',
      actionPlan: chatDecision,
      actionStatus: 'planned',
      candidate: chatCandidate,
    });
    const collectResult = makeResult({
      id: 'result-collect',
      candidateId: 'candidate-collect',
      decisionAction: 'collect',
      decisionPriority: 'medium',
      decisionReason: 'needs resume',
      actionPlan: collectDecision,
      actionStatus: 'planned',
      candidate: collectCandidate,
    });
    const chatDetail = makeDetail({
      ...chatResult,
      actionLogs: [
        { ...makePlannedActionLog(chatResult, chatDecision), id: 'chat-log-candidate-chat' },
        { ...makePlannedActionLog(chatResult, collectDecision), id: 'collect-log-candidate-chat' },
      ],
    });
    const collectDetail = makeDetail({
      ...collectResult,
      actionLogs: [makePlannedActionLog(collectResult, collectDecision)],
    });

    dependencies.repo.listResults = jest.fn().mockResolvedValue([chatResult, collectResult]);
    dependencies.repo.getDetail = jest
      .fn()
      .mockImplementation(async ({ candidateId }) =>
        candidateId === 'candidate-chat' ? chatDetail : collectDetail,
      );
    dependencies.repo.claimActionLog = jest
      .fn()
      .mockImplementation(async ({ id }) =>
        id === chatDetail.actionLogs[0]?.id
          ? chatDetail.actionLogs[0]
          : collectDetail.actionLogs[0],
      );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-chat',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(workflow.collectCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate-collect',
      displayName: 'Grace Hopper',
      profileUrl: 'https://example.com/grace',
    });
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(adapter.collectCandidate).not.toHaveBeenCalled();
  });

  it('continues the run after a workflow greeting failure for one candidate', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      contactAndCollectCandidate: jest.fn().mockResolvedValue({
        success: false,
        error: 'send button missing',
        browserTrace: { contact: 'failed', collect: 'not_attempted' },
      }),
      collectCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { action: 'collect' },
      }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const chatCandidate = {
      ...makeResult().candidate,
      id: 'candidate-chat',
      displayName: 'Ada Lovelace',
    };
    const collectCandidate = {
      ...makeResult().candidate,
      id: 'candidate-collect',
      displayName: 'Grace Hopper',
    };
    const chatResult = makeResult({
      id: 'result-chat',
      candidateId: 'candidate-chat',
      actionPlan: chatDecision,
      actionStatus: 'planned',
      candidate: chatCandidate,
    });
    const collectResult = makeResult({
      id: 'result-collect',
      candidateId: 'candidate-collect',
      decisionAction: 'collect',
      decisionPriority: 'medium',
      decisionReason: 'needs resume',
      actionPlan: collectDecision,
      actionStatus: 'planned',
      candidate: collectCandidate,
    });
    const chatDetail = makeDetail({
      ...chatResult,
      actionLogs: [
        { ...makePlannedActionLog(chatResult, chatDecision), id: 'chat-log-candidate-chat' },
        { ...makePlannedActionLog(chatResult, collectDecision), id: 'collect-log-candidate-chat' },
      ],
    });
    const collectDetail = makeDetail({
      ...collectResult,
      actionLogs: [makePlannedActionLog(collectResult, collectDecision)],
    });

    dependencies.repo.listResults = jest.fn().mockResolvedValue([chatResult, collectResult]);
    dependencies.repo.getDetail = jest
      .fn()
      .mockImplementation(async ({ candidateId }) =>
        candidateId === 'candidate-chat' ? chatDetail : collectDetail,
      );
    dependencies.repo.claimActionLog = jest
      .fn()
      .mockImplementation(async ({ id }) =>
        id === chatDetail.actionLogs[0]?.id
          ? chatDetail.actionLogs[0]
          : collectDetail.actionLogs[0],
      );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(workflow.collectCandidate).toHaveBeenCalled();
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: chatDetail.actionLogs[0]?.id,
        status: 'failed',
        errorMessage: 'send button missing',
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('executes a chat decision as one contact-then-collect workflow and records both actions', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      contactAndCollectCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { contact: 'success', collect: 'success' },
      }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const result = makeResult({ actionPlan: chatDecision, actionStatus: 'planned' });
    const chatLog = makePlannedActionLog(result, chatDecision);
    const collectLog = makePlannedActionLog(result, collectDecision);
    const detail = makeDetail({ ...result, actionLogs: [chatLog, collectLog] });
    dependencies.repo.listResults = jest.fn().mockResolvedValue([result]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(chatLog);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(workflow.collectCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: chatLog.id, status: 'success' }),
    );
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: collectLog.id, status: 'success' }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({ actionStatus: 'success', interviewStage: 'collected' }),
    );
  });

  it('resumes collection without re-sending a successful greeting', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      loadExact: jest.fn().mockResolvedValue(makeWorkflowSkill({ id: 'screen-v1' })),
      contactAndCollectCandidate: jest.fn().mockResolvedValue({
        success: false,
        error: 'collect target missing',
        browserTrace: { contact: 'success', collect: 'failed' },
      }),
      collectCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { action: 'collect' },
      }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const retryableClaim = jest.fn().mockResolvedValue({
      ...makePlannedActionLog(makeResult(), collectDecision),
      status: 'running',
    });
    (
      dependencies.repo as typeof dependencies.repo & {
        claimRetryableCollectActionLog: jest.Mock;
      }
    ).claimRetryableCollectActionLog = retryableClaim;
    const plannedResult = makeResult({ actionPlan: chatDecision, actionStatus: 'planned' });
    const failedResult = makeResult({ actionPlan: chatDecision, actionStatus: 'failed' });
    const chatLog = makePlannedActionLog(plannedResult, chatDecision);
    const collectLog = makePlannedActionLog(plannedResult, collectDecision);
    const firstDetail = makeDetail({ ...plannedResult, actionLogs: [chatLog, collectLog] });
    const secondDetail = makeDetail({
      ...failedResult,
      actionLogs: [
        { ...chatLog, status: 'success' },
        { ...collectLog, status: 'failed', errorMessage: 'collect target missing' },
      ],
    });
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        status: 'success',
        skillId: 'screen-v1',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest
      .fn()
      .mockResolvedValueOnce([plannedResult])
      .mockResolvedValueOnce([failedResult]);
    dependencies.repo.getDetail = jest
      .fn()
      .mockResolvedValueOnce(firstDetail)
      .mockResolvedValueOnce(secondDetail);
    dependencies.repo.claimActionLog = jest
      .fn()
      .mockResolvedValue({ ...chatLog, status: 'running' });

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });
    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledTimes(1);
    expect(workflow.collectCandidate).toHaveBeenCalledTimes(1);
    expect(retryableClaim).toHaveBeenCalledWith({ userId: 'user-1', id: collectLog.id });
  });

  it('advances a dry-run through planning, live search, ingest, vector recall, evaluation, ranking, and action planning', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-candidate-1',
              name: 'Ada Lovelace',
              resumeText: 'React TypeScript platform work',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest.fn().mockResolvedValueOnce({
      candidateId: 'candidate-live',
      resumeId: 'resume-live',
      identityHash: 'identity-live',
      chunkCount: 3,
    });
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      {
        id: 'chunk-vector-1',
        candidateId: 'candidate-vector',
        resumeId: 'resume-vector',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'React SaaS search workflow',
        displayName: 'Grace Hopper',
        currentTitle: 'Staff Engineer',
        currentCompany: 'Compilers Inc',
        profileUrl: '/employer/resumes/2',
        score: 0.82,
      },
    ]);
    dependencies.mergeAndRank = jest.fn().mockReturnValueOnce([
      { candidateId: 'candidate-live', matchScore: 1, source: 'live_search', rank: 1 },
      { candidateId: 'candidate-vector', matchScore: 0.82, source: 'vector_recall', rank: 2 },
    ]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score, decision: chatDecision })
      .mockResolvedValueOnce({ tags, score: { ...score, total: 72 }, decision: collectDecision });
    dependencies.repo.upsertResult = jest.fn(
      async (params: Parameters<ScreeningRunnerDependencies['repo']['upsertResult']>[0]) =>
        makeResult({
          id: `result-${params.candidateId}`,
          candidateId: params.candidateId,
          resumeId: params.resumeId,
          source: params.source,
          scoreDetail: params.scoreDetail,
          finalScore: params.finalScore,
          rank: params.rank,
          decisionAction: params.decisionAction,
          decisionPriority: params.decisionPriority,
          decisionReason: params.decisionReason,
          actionPlan: params.actionPlan ?? null,
        }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    const updateRunMock = dependencies.repo.updateRun as jest.Mock;
    expect(updateRunMock.mock.calls.map((call) => call[0].currentStage).filter(Boolean)).toEqual([
      'planning',
      'searching_live',
      'ingesting_live',
      'indexing_resumes',
      'recalling_vectors',
      'evaluating',
      'ranking',
      'planning_actions',
      'finalizing',
    ]);
    expect(dependencies.buildPlan).toHaveBeenCalledWith(jobDescription);
    expect(dependencies.createAdapter).toHaveBeenCalledWith('boss-like', { userId: 'user-1' });
    expect(adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(adapter.searchCandidates).toHaveBeenCalledWith(searchPlan, {
      maxCandidates: 20,
      batchSize: 10,
    });
    expect(dependencies.ingestCandidate).toHaveBeenCalledWith({
      userId: 'user-1',
      sourcePlatform: 'boss-like',
      rawCandidate: expect.objectContaining({ name: 'Ada Lovelace' }),
    });
    expect(dependencies.recallCandidates).toHaveBeenCalledWith({
      userId: 'user-1',
      retrievalQuery: 'frontend react',
      topK: 10,
      allowAlreadyContacted: false,
    });
    expect(dependencies.mergeAndRank).toHaveBeenCalledWith({
      live: [{ candidateId: 'candidate-live', matchScore: 1 }],
      vector: [{ candidateId: 'candidate-vector', matchScore: 0.82 }],
    });
    expect(dependencies.repo.upsertResult).toHaveBeenCalledTimes(2);
    expect(dependencies.repo.createActionLog).toHaveBeenCalledTimes(3);
    expect(dependencies.repo.createActionLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'dry_run',
        status: 'planned',
        action: 'chat',
        candidateId: 'candidate-vector',
      }),
    );
    expect(dependencies.repo.createActionLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mode: 'dry_run',
        status: 'planned',
        action: 'collect',
        candidateId: 'candidate-vector',
      }),
    );
    expect(dependencies.repo.createActionLog).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        mode: 'dry_run',
        status: 'planned',
        action: 'collect',
        candidateId: 'candidate-live',
      }),
    );
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(adapter.collectCandidate).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledTimes(1);
    expect(updateRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        status: 'success',
        currentStage: 'finalizing',
        errorMessage: null,
        stats: expect.objectContaining({
          fetched: 1,
          stored: 1,
          vectorRecalled: 1,
          evaluated: 2,
          recommendedChat: 1,
          recommendedCollect: 1,
          skipped: 0,
          failed: 0,
        }),
      }),
    );
  });

  it('records the loaded scoring quality mechanism during planning', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() => batches({ candidates: [] })),
    });
    const dependencies = makeDependencies(adapter);
    const evaluationSchemaWithQuality: EvaluationSchema = {
      ...evaluationSchema,
      calibrationProfile: buildCalibrationProfileFromJd(jobDescription),
      qualityPolicy: buildScoringQualityPolicy(),
    };
    dependencies.buildPlan = jest
      .fn()
      .mockReturnValueOnce({ searchPlan, evaluationSchema: evaluationSchemaWithQuality });

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        stage: 'planning',
        level: 'success',
        message: '加载评分质量机制：技术研发',
        detail: expect.objectContaining({
          category: 'technical',
          categoryLabel: '技术研发',
          versions: expect.objectContaining({
            promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
            scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
            calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
            qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
          }),
          anchors: expect.arrayContaining([
            expect.objectContaining({
              label: '强匹配',
              expectedAction: 'chat',
              scoreRange: [85, 100],
            }),
          ]),
          regressionTiers: expect.arrayContaining([
            expect.objectContaining({ name: 'replay', llmCalls: 'none' }),
          ]),
        }),
      }),
    );
  });

  it('passes strict evaluation when the screening run is execution mode', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: 'Frontend Engineer',
        candidateName: 'Ada Lovelace',
        strict: true,
      }),
    );
  });

  it('creates planned action logs with the request mode', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'execution',
        status: 'planned',
        action: 'chat',
      }),
    );
  });

  it('finalizes skip decisions during execution action planning without adapter execution', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.evaluateCandidate = jest.fn().mockResolvedValue({
      tags,
      score,
      decision: skipDecision,
    });
    dependencies.repo.upsertResult = jest.fn().mockResolvedValue(
      makeResult({
        decisionAction: 'skip',
        decisionPriority: 'low',
        decisionReason: 'not relevant',
        actionPlan: skipDecision,
        actionStatus: 'skipped',
        interviewStage: 'screened',
      }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionAction: 'skip',
        actionStatus: 'skipped',
        interviewStage: 'screened',
      }),
    );
    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'skip',
        status: 'skipped',
        mode: 'execution',
      }),
    );
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(adapter.collectCandidate).not.toHaveBeenCalled();
  });

  it('automatically executes planned chat actions during an execution screening run', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
      chatCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { action: 'chat', candidateId: 'candidate-1' },
      }),
    });
    const workflow = makeWorkflowSession(adapter, {
      contactAndCollectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const plannedResult = makeResult({
      id: 'result-1',
      candidateId: 'candidate-1',
      actionPlan: chatDecision,
      actionStatus: 'planned',
      interviewStage: 'to_contact',
    });
    const detail = makeDetail({
      ...plannedResult,
      actionLogs: [
        {
          id: 'action-log-1',
          userId: 'user-1',
          runId: 'run-1',
          screeningResultId: 'result-1',
          candidateId: 'candidate-1',
          jobDescriptionId: 'jd-1',
          platform: 'boss-like',
          mode: 'execution',
          action: 'chat',
          message: 'chat candidate',
          status: 'planned',
          idempotencyKey: 'execution-key',
          browserTrace: null,
          errorMessage: null,
          createdAt,
          updatedAt,
        },
        {
          id: 'collect-log-1',
          userId: 'user-1',
          runId: 'run-1',
          screeningResultId: 'result-1',
          candidateId: 'candidate-1',
          jobDescriptionId: 'jd-1',
          platform: 'boss-like',
          mode: 'execution',
          action: 'collect',
          message: null,
          status: 'planned',
          idempotencyKey: 'execution-collect-key',
          browserTrace: null,
          errorMessage: null,
          createdAt,
          updatedAt,
        },
      ],
    });

    dependencies.repo.upsertResult = jest.fn().mockResolvedValue(plannedResult);
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'execution' }),
    );
    expect(dependencies.repo.listResults).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        runId: 'run-1',
        plannedActions: ['chat', 'collect'],
      }),
    );
    expect(dependencies.repo.claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-log-1',
    });
    expect(adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        actionStatus: 'success',
        interviewStage: 'contacted',
      }),
    );
  });

  it('automatically executes planned collect actions during an execution screening run', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
      collectCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { action: 'collect', candidateId: 'candidate-1' },
      }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.evaluateCandidate = jest.fn().mockResolvedValue({
      tags,
      score,
      decision: collectDecision,
    });
    const plannedResult = makeResult({
      id: 'result-1',
      candidateId: 'candidate-1',
      decisionAction: 'collect',
      decisionPriority: 'medium',
      decisionReason: 'needs resume',
      actionPlan: collectDecision,
      actionStatus: 'planned',
      interviewStage: 'to_contact',
    });
    const detail = makeDetail({
      ...plannedResult,
      actionLogs: [
        {
          id: 'action-log-1',
          userId: 'user-1',
          runId: 'run-1',
          screeningResultId: 'result-1',
          candidateId: 'candidate-1',
          jobDescriptionId: 'jd-1',
          platform: 'boss-like',
          mode: 'execution',
          action: 'collect',
          message: null,
          status: 'planned',
          idempotencyKey: 'execution-collect-key',
          browserTrace: null,
          errorMessage: null,
          createdAt,
          updatedAt,
        },
      ],
    });

    dependencies.repo.upsertResult = jest.fn().mockResolvedValue(plannedResult);
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(adapter.collectCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      displayName: 'Ada Lovelace',
      profileUrl: 'https://example.com/ada',
    });
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'action-log-1',
        status: 'success',
        browserTrace: { action: 'collect', candidateId: 'candidate-1' },
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        actionStatus: 'success',
        interviewStage: 'collected',
      }),
    );
  });

  it('records failed status and error message when adapter search fails', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() => {
        throw new Error('adapter unavailable');
      }),
    });
    const dependencies = makeDependencies(adapter);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        status: 'failed',
        errorMessage: 'adapter unavailable',
        stats: expect.objectContaining({ failed: 1 }),
      }),
    );
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it('evaluates only the merged candidate pool and ranks final actions by evaluation score', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-live-a',
              name: 'Ada One',
              resumeText: 'React platform work',
            }),
            makeRawCandidate({
              platformCandidateId: 'platform-live-b',
              name: 'Ada Two',
              resumeText: 'React SaaS leadership',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate-a',
        resumeId: 'resume-a',
        identityHash: 'identity-a',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-b',
        resumeId: 'resume-b',
        identityHash: 'identity-b',
        chunkCount: 1,
      });
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector-a',
        displayName: 'Vector One',
        score: 0.99,
      }),
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector-b',
        displayName: 'Vector Two',
        score: 0.98,
      }),
    ]);
    dependencies.mergeAndRank = jest.fn().mockReturnValueOnce([
      { candidateId: 'candidate-a', matchScore: 1, source: 'live_search', rank: 1 },
      { candidateId: 'candidate-b', matchScore: 1, source: 'live_search', rank: 2 },
      { candidateId: 'candidate-vector-a', matchScore: 0.99, source: 'vector_recall', rank: 3 },
      { candidateId: 'candidate-vector-b', matchScore: 0.98, source: 'vector_recall', rank: 4 },
    ]);
    dependencies.evaluateCandidate = jest.fn(async ({ candidateName }) => {
      if (candidateName === 'Ada Two') {
        return { tags, score: { ...score, total: 95 }, decision: chatDecision };
      }
      return { tags, score: { ...score, total: 70 }, decision: collectDecision };
    });
    dependencies.repo.upsertResult = jest.fn(
      async (params: Parameters<ScreeningRunnerDependencies['repo']['upsertResult']>[0]) =>
        makeResult({
          id: `result-${params.candidateId}`,
          candidateId: params.candidateId,
          resumeId: params.resumeId,
          source: params.source,
          scoreDetail: params.scoreDetail,
          finalScore: params.finalScore,
          rank: params.rank,
          decisionAction: params.decisionAction,
          decisionPriority: params.decisionPriority,
          decisionReason: params.decisionReason,
          actionPlan: params.actionPlan ?? null,
        }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 4, batchSize: 2 },
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(4);
    expect(
      (dependencies.evaluateCandidate as jest.Mock).mock.calls.map((call) => call[0].candidateName),
    ).toEqual(['Vector One', 'Ada One', 'Vector Two', 'Ada Two']);
    expect(dependencies.repo.upsertResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        candidateId: 'candidate-b',
        rank: 1,
        finalScore: 95,
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        candidateId: 'candidate-a',
        rank: 2,
        finalScore: 70,
      }),
    );
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ranking',
        level: 'success',
        message: '排序完成：4 人',
        detail: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              candidateId: 'candidate-b',
              candidateName: 'Ada Two',
              rank: 1,
              finalScore: 95,
              action: 'chat',
            }),
            expect.objectContaining({
              candidateId: 'candidate-a',
              candidateName: 'Ada One',
              rank: 2,
              finalScore: 70,
              action: 'collect',
            }),
          ]),
        }),
      }),
    );
  });

  it('keeps recalled candidates in the evaluation pool when live search fills the request limit', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-live-a',
              name: 'Live One',
              resumeText: 'React platform work',
            }),
            makeRawCandidate({
              platformCandidateId: 'platform-live-b',
              name: 'Live Two',
              resumeText: 'React dashboard work',
            }),
            makeRawCandidate({
              platformCandidateId: 'platform-live-c',
              name: 'Live Three',
              resumeText: 'React component work',
            }),
            makeRawCandidate({
              platformCandidateId: 'platform-live-d',
              name: 'Live Four',
              resumeText: 'React form work',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate-live-a',
        resumeId: 'resume-live-a',
        identityHash: 'identity-live-a',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-live-b',
        resumeId: 'resume-live-b',
        identityHash: 'identity-live-b',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-live-c',
        resumeId: 'resume-live-c',
        identityHash: 'identity-live-c',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-live-d',
        resumeId: 'resume-live-d',
        identityHash: 'identity-live-d',
        chunkCount: 1,
      });
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector-a',
        displayName: 'Vector One',
        score: 0.99,
      }),
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector-b',
        displayName: 'Vector Two',
        score: 0.98,
      }),
    ]);
    dependencies.mergeAndRank = jest.fn().mockReturnValue([
      { candidateId: 'candidate-live-a', matchScore: 1, source: 'live_search', rank: 1 },
      { candidateId: 'candidate-live-b', matchScore: 1, source: 'live_search', rank: 2 },
      { candidateId: 'candidate-live-c', matchScore: 1, source: 'live_search', rank: 3 },
      { candidateId: 'candidate-live-d', matchScore: 1, source: 'live_search', rank: 4 },
      { candidateId: 'candidate-vector-a', matchScore: 0.99, source: 'vector_recall', rank: 5 },
      { candidateId: 'candidate-vector-b', matchScore: 0.98, source: 'vector_recall', rank: 6 },
    ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 4, batchSize: 4 },
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(4);
    expect(
      (dependencies.evaluateCandidate as jest.Mock).mock.calls.map((call) => call[0].candidateName),
    ).toEqual(['Vector One', 'Live One', 'Vector Two', 'Live Two']);
  });

  it('continues a run when one candidate evaluation returns empty content', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-live-a',
              name: 'Ada One',
              resumeText: 'React platform work',
            }),
            makeRawCandidate({
              platformCandidateId: 'platform-live-b',
              name: 'Ada Two',
              resumeText: 'React SaaS leadership',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate-a',
        resumeId: 'resume-a',
        identityHash: 'identity-a',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-b',
        resumeId: 'resume-b',
        identityHash: 'identity-b',
        chunkCount: 1,
      });
    dependencies.mergeAndRank = jest.fn().mockReturnValueOnce([
      { candidateId: 'candidate-a', matchScore: 1, source: 'live_search', rank: 1 },
      { candidateId: 'candidate-b', matchScore: 1, source: 'live_search', rank: 2 },
    ]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score, decision: chatDecision })
      .mockRejectedValueOnce(new Error('Candidate evaluation returned empty content'));

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 2, batchSize: 2, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.upsertResult).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'evaluating',
        level: 'error',
        message: '评估失败：Ada Two',
        detail: expect.objectContaining({
          candidateName: 'Ada Two',
          errorMessage: 'Candidate evaluation returned empty content',
        }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        currentStage: 'finalizing',
        stats: expect.objectContaining({
          evaluated: 1,
          failed: 1,
        }),
      }),
    );
  });

  it('fails the run when every selected candidate evaluation fails', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-live-a',
              name: 'Ada One',
              resumeText: 'React platform work',
            }),
            makeRawCandidate({
              platformCandidateId: 'platform-live-b',
              name: 'Ada Two',
              resumeText: 'React SaaS leadership',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate-a',
        resumeId: 'resume-a',
        identityHash: 'identity-a',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-b',
        resumeId: 'resume-b',
        identityHash: 'identity-b',
        chunkCount: 1,
      });
    dependencies.mergeAndRank = jest.fn().mockReturnValue([
      { candidateId: 'candidate-a', matchScore: 1, source: 'live_search', rank: 1 },
      { candidateId: 'candidate-b', matchScore: 1, source: 'live_search', rank: 2 },
    ]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockRejectedValueOnce(new Error('Candidate evaluation returned empty content'))
      .mockRejectedValueOnce(new Error('Candidate evaluation returned empty content'));

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, maxCandidates: 2, batchSize: 2, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.upsertResult).not.toHaveBeenCalled();
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'evaluating',
        level: 'error',
        message: '评估阶段无可用结果',
        detail: expect.objectContaining({
          selectedCandidateCount: 2,
          failed: 2,
        }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'No candidate evaluations succeeded',
        stats: expect.objectContaining({
          evaluated: 0,
          failed: 3,
        }),
      }),
    );
  });

  it('skips exact raw identity duplicates before ingesting resume work', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({ platformCandidateId: 'platform-candidate-1', name: 'Ada One' }),
            makeRawCandidate({ platformCandidateId: 'platform-candidate-1', name: 'Ada Again' }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest.fn().mockResolvedValueOnce({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: 'identity-live',
      chunkCount: 1,
    });
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-1', matchScore: 1, source: 'live_search', rank: 1 },
      ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.ingestCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        stage: 'searching_live',
        level: 'warning',
        message: 'search_candidate_duplicate',
        detail: expect.objectContaining({
          candidateName: 'Ada Again',
          dedupeBy: 'raw_identity',
          platformCandidateId: 'platform-candidate-1',
        }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        currentWorkflowStep: null,
        stats: expect.objectContaining({
          fetched: 1,
          stored: 1,
          deduped: 1,
        }),
      }),
    );
  });

  it('stops existing library candidates before recall, evaluation, and action planning', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-candidate-1',
              name: 'Ada Existing',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    const workflow = makeWorkflowSession(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    dependencies.ingestCandidate = jest.fn().mockResolvedValueOnce({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: 'identity-live',
      chunkCount: 1,
      candidateWasExisting: true,
      resumeWasExisting: true,
      existingCandidateId: 'candidate-1',
      existingCandidateName: 'Ada Existing',
      existingResumeId: 'resume-1',
    });
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        displayName: 'Ada Existing',
      }),
    ]);
    dependencies.mergeAndRank = jest.fn().mockReturnValueOnce([]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.mergeAndRank).toHaveBeenCalledWith({ live: [], vector: [] });
    expect(dependencies.evaluateCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.upsertResult).not.toHaveBeenCalled();
    expect(dependencies.repo.createActionLog).not.toHaveBeenCalled();
    expect(workflow.contactAndCollectCandidate).not.toHaveBeenCalled();
    expect(workflow.collectCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'indexing_resumes',
        level: 'warning',
        message: '跳过已有候选人后续流程：Ada Existing',
        detail: expect.objectContaining({
          candidateName: 'Ada Existing',
          candidateWasExisting: true,
          resumeWasExisting: true,
          dedupeBy: 'existing_candidate_identity',
          duplicateOf: expect.objectContaining({
            candidateName: 'Ada Existing',
            candidateId: 'candidate-1',
            resumeId: 'resume-1',
            platformCandidateId: 'platform-candidate-1',
          }),
        }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        stats: expect.objectContaining({
          fetched: 1,
          stored: 0,
          deduped: 1,
          evaluated: 0,
          recommendedChat: 0,
          recommendedCollect: 0,
        }),
      }),
    );
  });

  it('continues candidates first ingested by the same run when recovering', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-candidate-1',
              name: 'Ada Recovery',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.repo.listRunEvents = jest.fn().mockResolvedValueOnce([
      {
        id: 'event-ingested',
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        stage: 'indexing_resumes',
        level: 'success',
        message: '候选人入库：Ada Recovery',
        detail: null,
        createdAt,
      },
    ]);
    dependencies.ingestCandidate = jest.fn().mockResolvedValueOnce({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: 'identity-live',
      chunkCount: 0,
      candidateContacted: false,
      candidateWasExisting: true,
      resumeWasExisting: true,
      existingCandidateId: 'candidate-1',
      existingCandidateName: 'Ada Recovery',
      existingResumeId: 'resume-1',
    });
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-1', matchScore: 1, source: 'live_search', rank: 1 },
      ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: 'candidate-1', action: 'chat' }),
    );
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        message: '恢复本次运行候选人：Ada Recovery',
      }),
    );
  });

  it('skips action planning for already contacted live candidates when repeats are disallowed', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-candidate-1',
              name: 'Ada Contacted',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest.fn().mockResolvedValueOnce({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: 'identity-live',
      chunkCount: 1,
      candidateContacted: true,
      candidateWasExisting: false,
      resumeWasExisting: false,
      existingCandidateId: null,
      existingCandidateName: null,
      existingResumeId: null,
    });
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-1', matchScore: 1, source: 'live_search', rank: 1 },
      ]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score, decision: chatDecision });
    const contactedResult = makeResult({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      actionStatus: 'success',
      interviewStage: 'contacted',
      notes: 'already reached on previous run',
      candidate: {
        ...makeResult().candidate,
        contacted: true,
      },
    });
    dependencies.repo.listResults = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([contactedResult]);
    dependencies.repo.upsertResult = jest.fn().mockResolvedValueOnce(
      makeResult({
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        decisionAction: 'skip',
        decisionReason: '候选人已联系过，跳过本次自动动作',
        actionStatus: 'success',
        interviewStage: 'contacted',
      }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.repo.listResults).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateIds: ['candidate-1'],
      limit: 1,
    });
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        decisionAction: 'skip',
        decisionReason: '候选人已联系过，跳过本次自动动作',
      }),
    );
    const upsertPayload = (dependencies.repo.upsertResult as jest.Mock).mock.calls[0]?.[0] as {
      actionStatus?: string;
      interviewStage?: string;
      notes?: string | null;
    };
    expect(upsertPayload).toMatchObject({
      actionStatus: 'skipped',
      interviewStage: 'contacted',
      notes: 'already reached on previous run',
    });
    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        action: 'skip',
        status: 'skipped',
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        stats: expect.objectContaining({
          recommendedChat: 0,
          skipped: 1,
        }),
      }),
    );
  });

  it('preserves already contacted progress even when the evaluated action is skip', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({
              platformCandidateId: 'platform-candidate-1',
              name: 'Ada Contacted',
            }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest.fn().mockResolvedValueOnce({
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      identityHash: 'identity-live',
      chunkCount: 1,
      candidateContacted: true,
      candidateWasExisting: false,
      resumeWasExisting: false,
      existingCandidateId: null,
      existingCandidateName: null,
      existingResumeId: null,
    });
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-1', matchScore: 1, source: 'live_search', rank: 1 },
      ]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score, decision: skipDecision });
    dependencies.repo.listResults = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeResult({
          candidateId: 'candidate-1',
          resumeId: 'resume-1',
          actionStatus: 'success',
          interviewStage: 'contacted',
          notes: 'keep contacted progress',
          candidate: {
            ...makeResult().candidate,
            contacted: true,
          },
        }),
      ]);
    dependencies.repo.upsertResult = jest.fn().mockResolvedValueOnce(
      makeResult({
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        decisionAction: 'skip',
        decisionReason: skipDecision.reason,
        actionStatus: 'success',
        interviewStage: 'contacted',
      }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    const upsertPayload = (dependencies.repo.upsertResult as jest.Mock).mock.calls[0]?.[0] as {
      actionStatus?: string;
      interviewStage?: string;
      notes?: string | null;
    };
    expect(upsertPayload).toMatchObject({
      actionStatus: 'skipped',
      interviewStage: 'contacted',
      notes: 'keep contacted progress',
    });
    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        action: 'skip',
        status: 'skipped',
      }),
    );
  });

  it('skips duplicate candidates inside the same run', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [
            makeRawCandidate({ platformCandidateId: 'platform-candidate-1', name: 'Ada One' }),
            makeRawCandidate({ platformCandidateId: 'platform-candidate-2', name: 'Ada Two' }),
          ],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.ingestCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        identityHash: 'same-identity',
        chunkCount: 1,
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate-duplicate',
        resumeId: 'resume-duplicate',
        identityHash: 'same-identity',
        chunkCount: 1,
      });
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-1', matchScore: 1, source: 'live_search', rank: 1 },
      ]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.ingestCandidate).toHaveBeenCalledTimes(2);
    expect(dependencies.mergeAndRank).toHaveBeenCalledWith({
      live: [{ candidateId: 'candidate-1', matchScore: 1 }],
      vector: [],
    });
    expect(dependencies.repo.upsertResult).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        stats: expect.objectContaining({
          fetched: 2,
          stored: 1,
          deduped: 1,
        }),
      }),
    );
  });

  it('records per-candidate evaluation score details as run events', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate({ name: 'Ada Lovelace' })],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        stage: 'evaluating',
        level: 'success',
        message: '完成评估：Ada Lovelace',
        detail: expect.objectContaining({
          candidateName: 'Ada Lovelace',
          scoreDetail: score,
          decision: chatDecision,
        }),
      }),
    );
  });

  it('reuses historical JD evaluation for recalled candidates instead of scoring again', async () => {
    const dependencies = makeDependencies();
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      {
        id: 'chunk-vector-1',
        candidateId: 'candidate-vector',
        resumeId: 'resume-vector',
        userId: 'user-1',
        chunkIndex: 0,
        content: 'React SaaS search workflow',
        displayName: 'Grace Hopper',
        currentTitle: 'Staff Engineer',
        currentCompany: 'Compilers Inc',
        profileUrl: '/employer/resumes/2',
        score: 0.82,
      },
    ]);
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-vector', matchScore: 0.82, source: 'vector_recall', rank: 1 },
      ]);
    const historicalScore = { ...score, total: 91 };
    const historicalResult = makeResult({
      id: 'result-history',
      runId: 'previous-run',
      candidateId: 'candidate-vector',
      resumeId: 'resume-vector',
      source: 'vector_recall',
      scoreDetail: historicalScore,
      finalScore: 91,
      decisionAction: 'collect',
      decisionPriority: 'medium',
      decisionReason: '历史评分已确认匹配',
      actionPlan: { ...collectDecision, reason: '历史评分已确认匹配' },
      candidate: {
        ...makeResult().candidate,
        id: 'candidate-vector',
        displayName: 'Grace Hopper',
        profileUrl: '/employer/resumes/2',
      },
      resume: {
        ...makeResult().resume!,
        id: 'resume-vector',
        candidateId: 'candidate-vector',
        rawText: 'React SaaS search workflow',
        profileUrl: '/employer/resumes/2',
      },
    });
    dependencies.repo.listResults = jest.fn().mockResolvedValueOnce([historicalResult]);
    dependencies.repo.upsertResult = jest.fn().mockResolvedValueOnce(
      makeResult({
        id: 'result-history',
        candidateId: 'candidate-vector',
        resumeId: 'resume-vector',
        source: 'vector_recall',
        scoreDetail: historicalScore,
        finalScore: 91,
        decisionAction: 'collect',
        decisionPriority: 'medium',
        decisionReason: '历史评分已确认匹配',
        actionPlan: { ...collectDecision, reason: '历史评分已确认匹配' },
      }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.repo.listResults).toHaveBeenCalledWith({
      userId: 'user-1',
      jobDescriptionId: 'jd-1',
      candidateIds: ['candidate-vector'],
      limit: 1,
    });
    expect(dependencies.evaluateCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-vector',
        stage: 'evaluating',
        level: 'info',
        message: '复用历史评估：Grace Hopper',
        detail: expect.objectContaining({
          candidateName: 'Grace Hopper',
          previousRunId: 'previous-run',
          resultId: 'result-history',
          scoreDetail: historicalScore,
          decision: expect.objectContaining({
            action: 'collect',
            priority: 'medium',
            reason: '历史评分已确认匹配',
          }),
        }),
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        scoreDetail: historicalScore,
        finalScore: 91,
        decisionAction: 'collect',
        decisionPriority: 'medium',
        decisionReason: '历史评分已确认匹配',
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        stats: expect.objectContaining({
          evaluated: 1,
          recommendedCollect: 1,
        }),
      }),
    );
  });

  it('re-evaluates a candidate when the historical JD result belongs to a different resume', async () => {
    const dependencies = makeDependencies();
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        displayName: 'Grace Hopper',
        profileUrl: '/employer/resumes/2',
        score: 0.82,
      }),
    ]);
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-vector', matchScore: 0.82, source: 'vector_recall', rank: 1 },
      ]);
    const historicalResult = makeResult({
      id: 'result-history',
      runId: 'previous-run',
      candidateId: 'candidate-vector',
      resumeId: 'resume-previous',
      source: 'vector_recall',
      scoreDetail: { ...score, total: 91 },
      finalScore: 91,
      decisionAction: 'collect',
      decisionPriority: 'medium',
      decisionReason: '历史评分已确认匹配',
      actionPlan: { ...collectDecision, reason: '历史评分已确认匹配' },
      candidate: {
        ...makeResult().candidate,
        id: 'candidate-vector',
        displayName: 'Grace Hopper',
        profileUrl: '/employer/resumes/2',
      },
      resume: {
        ...makeResult().resume!,
        id: 'resume-previous',
        candidateId: 'candidate-vector',
        rawText: 'Old React SaaS workflow',
        profileUrl: '/employer/resumes/2',
      },
    });
    const freshScore = { ...score, total: 84 };
    dependencies.repo.listResults = jest.fn().mockResolvedValueOnce([historicalResult]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score: freshScore, decision: chatDecision });
    dependencies.repo.upsertResult = jest.fn().mockResolvedValueOnce(
      makeResult({
        id: 'result-history',
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        source: 'vector_recall',
        scoreDetail: freshScore,
        finalScore: 84,
        decisionAction: 'chat',
        decisionPriority: 'high',
        decisionReason: 'fresh score',
        actionPlan: chatDecision,
      }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.evaluateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateName: 'Grace Hopper',
        resumeText: 'React SaaS search workflow',
      }),
    );
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        stage: 'evaluating',
        level: 'warning',
        message: '历史评估已过期：Grace Hopper',
        detail: expect.objectContaining({
          staleEvaluation: true,
          previousRunId: 'previous-run',
          resultId: 'result-history',
          previousResumeId: 'resume-previous',
          currentResumeId: 'resume-current',
        }),
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        scoreDetail: freshScore,
        finalScore: 84,
        decisionAction: 'chat',
      }),
    );
  });

  it('re-evaluates a candidate when the historical result is older than the JD update', async () => {
    const dependencies = makeDependencies();
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        displayName: 'Grace Hopper',
        profileUrl: '/employer/resumes/2',
        score: 0.82,
      }),
    ]);
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-vector', matchScore: 0.82, source: 'vector_recall', rank: 1 },
      ]);
    dependencies.repo.listResults = jest.fn().mockResolvedValueOnce([
      makeResult({
        id: 'result-history',
        runId: 'previous-run',
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        source: 'vector_recall',
        updatedAt: '2026-06-01T00:00:00.000Z',
        scoreDetail: { ...score, total: 91 },
        finalScore: 91,
        decisionAction: 'collect',
        decisionPriority: 'medium',
        decisionReason: '历史评分已确认匹配',
        actionPlan: { ...collectDecision, reason: '历史评分已确认匹配' },
      }),
    ]);
    const freshScore = { ...score, total: 86 };
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score: freshScore, decision: chatDecision });

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription: {
        ...jobDescription,
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
      request,
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        stage: 'evaluating',
        level: 'warning',
        message: '历史评估已过期：Grace Hopper',
        detail: expect.objectContaining({
          staleEvaluation: true,
          staleReasons: ['JD 已更新，重新评估当前版本'],
          previousRunId: 'previous-run',
          resultId: 'result-history',
          previousResumeId: 'resume-current',
          currentResumeId: 'resume-current',
          jobDescriptionUpdatedAt: '2026-06-02T00:00:00.000Z',
        }),
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        scoreDetail: freshScore,
        finalScore: 86,
      }),
    );
  });

  it('re-evaluates a candidate when the historical score uses an old quality version', async () => {
    const dependencies = makeDependencies();
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        displayName: 'Grace Hopper',
        profileUrl: '/employer/resumes/2',
        score: 0.82,
      }),
    ]);
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-vector', matchScore: 0.82, source: 'vector_recall', rank: 1 },
      ]);
    dependencies.repo.listResults = jest.fn().mockResolvedValueOnce([
      makeResult({
        id: 'result-history',
        runId: 'previous-run',
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        source: 'vector_recall',
        updatedAt: '2026-06-02T00:00:00.000Z',
        scoreDetail: {
          ...score,
          calibrationVersion: 'candidate-calibration-v0',
          total: 91,
        },
        finalScore: 91,
        decisionAction: 'collect',
        decisionPriority: 'medium',
        decisionReason: '历史评分已确认匹配',
        actionPlan: { ...collectDecision, reason: '历史评分已确认匹配' },
      }),
    ]);
    const freshScore = { ...score, total: 86 };
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score: freshScore, decision: chatDecision });

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription: {
        ...jobDescription,
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      request,
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        stage: 'evaluating',
        level: 'warning',
        message: '历史评估已过期：Grace Hopper',
        detail: expect.objectContaining({
          staleEvaluation: true,
          staleReasons: ['评分质量机制已更新，重新评估当前版本'],
          previousQualityVersions: expect.objectContaining({
            promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
            scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
            calibrationVersion: 'candidate-calibration-v0',
            qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
          }),
          currentQualityVersions: expect.objectContaining({
            promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
            scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
            calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
            qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
          }),
        }),
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-vector',
        resumeId: 'resume-current',
        scoreDetail: freshScore,
        finalScore: 86,
      }),
    );
  });

  it('skips recalled boss-like candidates with unusable profile URLs before evaluation', async () => {
    const dependencies = makeDependencies();
    dependencies.recallCandidates = jest.fn().mockResolvedValueOnce([
      makeVectorRecallCandidate({
        candidateId: 'candidate-invalid',
        displayName: 'Stale Vector Candidate',
        profileUrl: '/employer/resumes/boss-visible-flow-5381d7473713-ada',
        score: 0.99,
      }),
      makeVectorRecallCandidate({
        candidateId: 'candidate-valid',
        displayName: 'Valid Boss Candidate',
        profileUrl: '/employer/resumes/303',
        score: 0.95,
      }),
    ]);
    dependencies.mergeAndRank = jest
      .fn()
      .mockReturnValueOnce([
        { candidateId: 'candidate-valid', matchScore: 0.95, source: 'vector_recall', rank: 1 },
      ]);
    dependencies.evaluateCandidate = jest
      .fn()
      .mockResolvedValueOnce({ tags, score, decision: chatDecision });

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    expect(dependencies.mergeAndRank).toHaveBeenCalledWith({
      live: [],
      vector: [{ candidateId: 'candidate-valid', matchScore: 0.95 }],
    });
    expect(dependencies.evaluateCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.evaluateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateName: 'Valid Boss Candidate',
      }),
    );
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'recalling_vectors',
        level: 'warning',
        message: '跳过无效召回候选人：Stale Vector Candidate',
        detail: expect.objectContaining({
          candidateName: 'Stale Vector Candidate',
          candidateId: 'candidate-invalid',
          profileUrl: '/employer/resumes/boss-visible-flow-5381d7473713-ada',
          reason: expect.stringMatching(/invalid candidate profileUrl/),
        }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        stats: expect.objectContaining({
          vectorRecalled: 2,
          evaluated: 1,
          skipped: 1,
          failed: 0,
        }),
      }),
    );
  });

  it('creates run-scoped planned action idempotency keys when rerunning the same JD and candidate', async () => {
    const dependencies = makeDependencies();
    dependencies.createAdapter = jest.fn(() =>
      makeAdapter({
        searchCandidates: jest.fn(() =>
          batches({
            candidates: [makeRawCandidate()],
          }),
        ),
      }),
    );

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });
    await runCandidateScreening({
      runId: 'run-2',
      userId: 'user-1',
      jobDescription,
      request,
      dependencies,
    });

    const idempotencyKeys = (dependencies.repo.createActionLog as jest.Mock).mock.calls.map(
      (call) => call[0].idempotencyKey,
    );
    expect(idempotencyKeys).toEqual([
      createActionIdempotencyKey({
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        action: 'chat',
      }),
      createActionIdempotencyKey({
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        action: 'collect',
      }),
      createActionIdempotencyKey({
        userId: 'user-1',
        runId: 'run-2',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        action: 'chat',
      }),
      createActionIdempotencyKey({
        userId: 'user-1',
        runId: 'run-2',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        action: 'collect',
      }),
    ]);
    expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[2]);
  });

  it('loads the stored workflow skill for manual planned actions instead of falling back to the adapter', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      loadExact: jest.fn().mockResolvedValue(makeWorkflowSkill({ id: 'screen-v1' })),
      contactAndCollectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const plannedResult = makeResult({
      actionPlan: chatDecision,
      actionStatus: 'planned',
      interviewStage: 'to_contact',
    });
    const detail = makeDetail({
      ...plannedResult,
      actionLogs: [
        { ...makePlannedActionLog(plannedResult, chatDecision), id: 'chat-log-1' },
        { ...makePlannedActionLog(plannedResult, collectDecision), id: 'collect-log-1' },
      ],
    });
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        status: 'success',
        skillId: 'screen-v1',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(workflow.loadExact).toHaveBeenCalledWith({
      skillId: 'screen-v1',
      stage: 'executing_actions',
    });
    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(adapter.loginIfNeeded).not.toHaveBeenCalled();
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
  });

  it('loads the stored workflow skill for a single candidate action', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      loadExact: jest.fn().mockResolvedValue(makeWorkflowSkill({ id: 'screen-v1' })),
      contactAndCollectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const result = makeResult();
    const detail = makeDetail({
      ...result,
      actionLogs: [
        { ...makePlannedActionLog(result, chatDecision), id: 'chat-log-1' },
        { ...makePlannedActionLog(result, collectDecision), id: 'collect-log-1' },
      ],
    });
    dependencies.repo.getRun = jest
      .fn()
      .mockResolvedValue(makeRun({ skillId: 'screen-v1', searchPlan, evaluationSchema }));
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await expect(
      executeSingleCandidateAction({
        runId: 'run-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        dependencies,
      }),
    ).resolves.toMatchObject({ status: 'success', candidateId: 'candidate-1' });

    expect(workflow.loadExact).toHaveBeenCalledWith({
      skillId: 'screen-v1',
      stage: 'executing_actions',
    });
    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(adapter.loginIfNeeded).not.toHaveBeenCalled();
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
  });

  it('records both chat and collect logs for a single browser-v2 action', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      loadExact: jest.fn().mockResolvedValue(makeWorkflowSkill({ id: 'screen-v1' })),
      contactAndCollectCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { contact: 'success', collect: 'success' },
      }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const result = makeResult();
    const chatLog = makePlannedActionLog(result, chatDecision);
    const collectLog = makePlannedActionLog(result, collectDecision);
    const detail = makeDetail({ ...result, actionLogs: [chatLog, collectLog] });
    dependencies.repo.getRun = jest
      .fn()
      .mockResolvedValue(makeRun({ skillId: 'screen-v1', searchPlan, evaluationSchema }));
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest
      .fn()
      .mockResolvedValue({ ...chatLog, status: 'running' });

    await expect(
      executeSingleCandidateAction({
        runId: 'run-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        dependencies,
      }),
    ).resolves.toMatchObject({ status: 'success', detail: '已发送单点沟通消息并收藏候选人' });

    expect(workflow.contactAndCollectCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: collectLog.id, status: 'success' }),
    );
  });

  it('does not run a browser workflow chat without its paired collect audit log', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      loadExact: jest.fn().mockResolvedValue(makeWorkflowSkill({ id: 'screen-v1' })),
      contactAndCollectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const detail = makeDetail();
    dependencies.repo.getRun = jest
      .fn()
      .mockResolvedValue(makeRun({ skillId: 'screen-v1', searchPlan, evaluationSchema }));
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await expect(
      executeSingleCandidateAction({
        runId: 'run-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        dependencies,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      errorMessage: 'paired collect action log is required for browser workflow chat',
    });

    expect(dependencies.createWorkflowSession).not.toHaveBeenCalled();
    expect(workflow.contactAndCollectCandidate).not.toHaveBeenCalled();
  });

  it('executes both legacy chat and collect before recording a single candidate action as successful', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
      collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const result = makeResult();
    const chatLog = { ...makePlannedActionLog(result, chatDecision), id: 'chat-log-1' };
    const collectLog = { ...makePlannedActionLog(result, collectDecision), id: 'collect-log-1' };
    const detail = makeDetail({ ...result, actionLogs: [chatLog, collectLog] });
    dependencies.repo.getRun = jest.fn().mockResolvedValue(makeRun({ skillId: null }));
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest
      .fn()
      .mockResolvedValue({ ...chatLog, status: 'running' });

    await expect(
      executeSingleCandidateAction({
        runId: 'run-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        dependencies,
      }),
    ).resolves.toMatchObject({ status: 'success', detail: '已发送单点沟通消息并收藏候选人' });

    expect(adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(adapter.chatCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(adapter.collectCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      displayName: 'Ada Lovelace',
      profileUrl: 'https://example.com/ada',
    });
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: collectLog.id, status: 'success' }),
    );
  });

  it('keeps a successful legacy chat when the paired single candidate collect fails', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
      collectCandidate: jest.fn().mockResolvedValue({ success: false, error: 'collect failed' }),
    });
    const dependencies = makeDependencies(adapter);
    const result = makeResult();
    const chatLog = { ...makePlannedActionLog(result, chatDecision), id: 'chat-log-1' };
    const collectLog = { ...makePlannedActionLog(result, collectDecision), id: 'collect-log-1' };
    const detail = makeDetail({ ...result, actionLogs: [chatLog, collectLog] });
    dependencies.repo.getRun = jest.fn().mockResolvedValue(makeRun({ skillId: null }));
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest
      .fn()
      .mockResolvedValue({ ...chatLog, status: 'running' });

    await expect(
      executeSingleCandidateAction({
        runId: 'run-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        dependencies,
      }),
    ).resolves.toMatchObject({ status: 'failed', errorMessage: 'collect failed' });

    expect(adapter.chatCandidate).toHaveBeenCalledTimes(1);
    expect(adapter.collectCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: chatLog.id, status: 'success' }),
    );
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: collectLog.id,
        status: 'failed',
        errorMessage: 'collect failed',
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionStatus: 'failed', interviewStage: 'contacted' }),
    );
  });

  it('clears the active workflow step when a single candidate action throws', async () => {
    const adapter = makeAdapter();
    const workflow = makeWorkflowSession(adapter, {
      loadExact: jest.fn().mockResolvedValue(makeWorkflowSkill({ id: 'screen-v1' })),
      contactAndCollectCandidate: jest.fn().mockRejectedValue(new Error('browser crashed')),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.createWorkflowSession = jest.fn().mockReturnValue(workflow);
    const result = makeResult();
    const detail = makeDetail({
      ...result,
      actionLogs: [
        { ...makePlannedActionLog(result, chatDecision), id: 'chat-log-1' },
        { ...makePlannedActionLog(result, collectDecision), id: 'collect-log-1' },
      ],
    });
    dependencies.repo.getRun = jest
      .fn()
      .mockResolvedValue(makeRun({ skillId: 'screen-v1', searchPlan, evaluationSchema }));
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await expect(
      executeSingleCandidateAction({
        runId: 'run-1',
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        dependencies,
      }),
    ).resolves.toMatchObject({ status: 'failed', errorMessage: 'browser crashed' });

    expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        currentWorkflowStep: null,
      }),
    );
  });

  it('executes planned actions only through executeScreeningRunActions and updates contacted state after successful chat action', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
      collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({
      id: 'result-1',
      candidateId: 'candidate-1',
      actionPlan: chatDecision,
      actionStatus: 'planned',
      interviewStage: 'to_contact',
    });
    const detail = makeDetail({
      ...plannedResult,
      actionLogs: [
        { ...makePlannedActionLog(plannedResult, chatDecision), id: 'action-log-1' },
        { ...makePlannedActionLog(plannedResult, collectDecision), id: 'collect-log-1' },
      ],
    });
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-1',
        status: 'success',
        searchPlan,
        evaluationSchema,
        stats: emptyStats({ recommendedChat: 1 }),
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);
    dependencies.repo.updateActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);
    dependencies.repo.upsertResult = jest.fn().mockResolvedValue(
      makeResult({
        id: 'result-1',
        candidateId: 'candidate-1',
        actionStatus: 'success',
        interviewStage: 'contacted',
      }),
    );

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(dependencies.createAdapter).toHaveBeenCalledWith('boss-like', { userId: 'user-1' });
    expect(adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.listResults).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        runId: 'run-1',
        plannedActions: ['chat', 'collect'],
      }),
    );
    expect(dependencies.repo.claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-log-1',
    });
    const claimOrder = (dependencies.repo.claimActionLog as jest.Mock).mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(
      (dependencies.createAdapter as jest.Mock).mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(claimOrder).toBeLessThan(
      adapter.loginIfNeeded.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(claimOrder).toBeLessThan(
      adapter.chatCandidate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(adapter.chatCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(adapter.collectCandidate).toHaveBeenCalled();
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'executing_actions',
        message: '执行动作：Ada Lovelace',
        detail: expect.objectContaining({
          action: 'chat',
          actionMessage: 'chat candidate',
          candidateName: 'Ada Lovelace',
          priority: 'high',
        }),
      }),
    );
    expect(dependencies.repo.createRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'executing_actions',
        level: 'success',
        message: '动作执行成功：Ada Lovelace',
        detail: expect.objectContaining({
          action: 'chat',
          actionMessage: 'chat candidate',
          candidateName: 'Ada Lovelace',
        }),
      }),
    );
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        id: 'action-log-1',
        status: 'success',
        browserTrace: { contact: 'success', collect: 'success' },
        errorMessage: null,
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        actionStatus: 'success',
        interviewStage: 'contacted',
        actionPlan: chatDecision,
      }),
    );
    expect(dependencies.repo.upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sourcePlatform: 'boss-like',
        displayName: 'Ada Lovelace',
        currentTitle: 'Senior Frontend Engineer',
        currentCompany: 'Analytical Engines',
        location: 'Shanghai',
        experienceYears: 6,
        platformCandidateId: 'platform-candidate-1',
        profileUrl: 'https://example.com/ada',
        identityKey: 'identity-key-1',
        identityHash: 'identity-hash-1',
        lastActiveAt: null,
        contacted: true,
        lastContactAt: expect.any(Date),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        currentStage: 'finalizing',
        errorMessage: null,
        stats: expect.objectContaining({ recommendedChat: 1 }),
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        status: 'running',
        currentStage: 'executing_actions',
        errorMessage: null,
        finishedAt: null,
      }),
    );
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it('does not collect for a legacy chat action without a paired collect log', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
      collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({ actionPlan: chatDecision, actionStatus: 'planned' });
    const detail = makeDetail(plannedResult);
    dependencies.repo.getRun = jest.fn().mockResolvedValue(makeRun({ skillId: null }));
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(adapter.chatCandidate).toHaveBeenCalledTimes(1);
    expect(adapter.collectCandidate).not.toHaveBeenCalled();
  });

  it('skips execution when the planned action log cannot be atomically claimed', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({ actionPlan: chatDecision, actionStatus: 'planned' });
    const detail = makeDetail(plannedResult);
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-1',
        status: 'success',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(null);

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(dependencies.repo.claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-log-1',
    });
    expect(dependencies.createAdapter).not.toHaveBeenCalled();
    expect(adapter.loginIfNeeded).not.toHaveBeenCalled();
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.upsertResult).not.toHaveBeenCalled();
  });

  it('executes current-run planned action logs even when the JD result belongs to an older run', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({
      runId: 'old-run',
      actionPlan: chatDecision,
      actionStatus: 'planned',
    });
    const detail = makeDetail({
      ...plannedResult,
      actionLogs: [
        {
          id: 'action-log-current-run',
          userId: 'user-1',
          runId: 'run-2',
          screeningResultId: plannedResult.id,
          candidateId: plannedResult.candidateId,
          jobDescriptionId: plannedResult.jobDescriptionId,
          platform: 'boss-like',
          mode: 'dry_run',
          action: 'chat',
          message: 'chat candidate',
          status: 'planned',
          idempotencyKey: 'current-run-key',
          browserTrace: null,
          errorMessage: null,
          createdAt,
          updatedAt,
        },
      ],
    });
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-2',
        status: 'success',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await executeScreeningRunActions({
      runId: 'run-2',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(dependencies.repo.listResults).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-2' }),
    );
    expect(adapter.chatCandidate).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-2',
        candidateId: 'candidate-1',
        actionStatus: 'success',
      }),
    );
  });

  it('does not let paired chat collections exceed the approved collect action limit', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
      collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const firstResult = makeResult({ id: 'result-1', candidateId: 'candidate-1', rank: 1 });
    const secondBase = makeResult();
    const secondResult = makeResult({
      id: 'result-2',
      candidateId: 'candidate-2',
      rank: 2,
      candidate: {
        ...secondBase.candidate,
        id: 'candidate-2',
        displayName: 'Grace Hopper',
        platformCandidateId: 'platform-candidate-2',
        profileUrl: 'https://example.com/grace',
      },
    });
    const details = new Map(
      [firstResult, secondResult].map((result) => {
        const chatLog = {
          ...makePlannedActionLog(result, chatDecision),
          id: `chat-log-${result.candidateId}`,
        };
        const collectLog = {
          ...makePlannedActionLog(result, collectDecision),
          id: `collect-log-${result.candidateId}`,
        };
        return [result.candidateId, makeDetail({ ...result, actionLogs: [chatLog, collectLog] })];
      }),
    );
    dependencies.repo.getRun = jest.fn().mockResolvedValue(makeRun({ skillId: null }));
    dependencies.repo.listResults = jest.fn().mockResolvedValue([firstResult, secondResult]);
    dependencies.repo.getDetail = jest.fn(
      async ({ candidateId }: { candidateId: string }) => details.get(candidateId) ?? null,
    );
    dependencies.repo.claimActionLog = jest.fn(async ({ id }: { id: string }) => {
      const log = [...details.values()]
        .flatMap((detail) => detail.actionLogs)
        .find((candidate) => candidate.id === id);
      return log ? { ...log, status: 'running' as const } : null;
    });

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: { confirmExecution: true, maxChatActions: 2, maxCollectActions: 1 },
      dependencies,
    });

    expect(adapter.chatCandidate).toHaveBeenCalledTimes(1);
    expect(adapter.collectCandidate).toHaveBeenCalledTimes(1);
  });

  it('requests executable planned actions so skip rows do not block lower-ranked chat execution', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockResolvedValue({ success: true }),
    });
    const dependencies = makeDependencies(adapter);
    const skipPlan = createDryRunActionPlan({
      action: 'skip',
      priority: 'low',
      candidateName: 'Skipped Candidate',
      jobTitle: jobDescription.position,
      reason: 'not relevant',
    });
    const skipResult = makeResult({
      id: 'result-skip',
      candidateId: 'candidate-skip',
      finalScore: 99,
      rank: 1,
      decisionAction: 'skip',
      decisionPriority: 'low',
      decisionReason: 'not relevant',
      actionPlan: skipPlan,
      actionStatus: 'planned',
    });
    const chatResult = makeResult({
      id: 'result-chat',
      candidateId: 'candidate-1',
      finalScore: 80,
      rank: 2,
      actionPlan: chatDecision,
      actionStatus: 'planned',
    });
    const detail = makeDetail(chatResult);
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-1',
        status: 'success',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn(async (params: { plannedActions?: string[] }) =>
      params.plannedActions ? [chatResult] : [skipResult],
    );
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: { confirmExecution: true, maxChatActions: 1, maxCollectActions: 1 },
      dependencies,
    });

    expect(dependencies.repo.listResults).toHaveBeenCalledWith(
      expect.objectContaining({ plannedActions: ['chat', 'collect'] }),
    );
    expect(adapter.chatCandidate).toHaveBeenCalledTimes(1);
    expect(adapter.chatCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
  });

  it('marks a claimed action failed and continues finalization when chat execution throws', async () => {
    const adapter = makeAdapter({
      chatCandidate: jest.fn().mockRejectedValue(new Error('browser crashed')),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({
      actionPlan: chatDecision,
      actionStatus: 'planned',
      interviewStage: 'to_contact',
      notes: 'keep note',
    });
    const detail = makeDetail(plannedResult);
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-1',
        status: 'success',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await executeScreeningRunActions({
      runId: 'run-1',
      userId: 'user-1',
      request: executeRequest,
      dependencies,
    });

    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        id: 'action-log-1',
        status: 'failed',
        errorMessage: 'browser crashed',
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        actionStatus: 'failed',
        interviewStage: 'to_contact',
        notes: 'keep note',
      }),
    );
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        currentStage: 'finalizing',
        currentWorkflowStep: null,
        stats: expect.objectContaining({ failed: 1 }),
      }),
    );
  });

  it('does not let adapter close failures mask finalized execution state', async () => {
    const adapter = makeAdapter({
      close: jest.fn().mockRejectedValue(new Error('close failed')),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({
      actionPlan: chatDecision,
      actionStatus: 'planned',
    });
    const detail = makeDetail(plannedResult);
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-1',
        status: 'success',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await expect(
      executeScreeningRunActions({
        runId: 'run-1',
        userId: 'user-1',
        request: executeRequest,
        dependencies,
      }),
    ).resolves.toBeUndefined();

    expect(adapter.close).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.updateRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        currentStage: 'finalizing',
      }),
    );
  });
});
