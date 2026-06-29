/** @jest-environment node */

import type { CandidateSourceAdapter, RawCandidateBatch } from './adapters/types';
import type { RawCandidate } from './ingest';
import type {
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
import {
  executeScreeningRunActions,
  runCandidateScreening,
  type ScreeningRunnerDependencies,
} from './runner';
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
    collectCandidate: jest.fn().mockResolvedValue({ success: true }),
    chatCandidate: jest.fn().mockResolvedValue({ success: true }),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<CandidateSourceAdapter>;
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

function makeDependencies(adapter = makeAdapter()): ScreeningRunnerDependencies & {
  adapter: jest.Mocked<CandidateSourceAdapter>;
} {
  return {
    adapter,
    buildPlan: jest.fn().mockReturnValue({ searchPlan, evaluationSchema }),
    createAdapter: jest.fn().mockReturnValue(adapter),
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
      listResults: jest.fn().mockResolvedValue([]),
      getDetail: jest.fn().mockResolvedValue(null),
      upsertCandidate: jest.fn().mockResolvedValue(makeResult().candidate),
      claimActionLog: jest.fn().mockResolvedValue(null),
    },
  };
}

describe('candidate screening runner', () => {
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
        profileUrl: 'https://example.com/grace',
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
    dependencies.repo.upsertResult = jest
      .fn()
      .mockResolvedValueOnce(makeResult({ id: 'result-live', candidateId: 'candidate-live' }))
      .mockResolvedValueOnce(
        makeResult({
          id: 'result-vector',
          candidateId: 'candidate-vector',
          source: 'vector_recall',
          rank: 2,
          decisionAction: 'collect',
          decisionPriority: 'medium',
          decisionReason: 'needs resume',
          actionPlan: collectDecision,
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
      'recalling_vectors',
      'evaluating',
      'ranking',
      'planning_actions',
      'finalizing',
    ]);
    expect(dependencies.buildPlan).toHaveBeenCalledWith(jobDescription);
    expect(dependencies.createAdapter).toHaveBeenCalledWith('boss-like');
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
      topK: 20,
      allowAlreadyContacted: false,
    });
    expect(dependencies.mergeAndRank).toHaveBeenCalledWith({
      live: [{ candidateId: 'candidate-live', matchScore: 1 }],
      vector: [{ candidateId: 'candidate-vector', matchScore: 0.82 }],
    });
    expect(dependencies.repo.upsertResult).toHaveBeenCalledTimes(2);
    expect(dependencies.repo.createActionLog).toHaveBeenCalledTimes(2);
    expect(dependencies.repo.createActionLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'dry_run',
        status: 'planned',
        action: 'chat',
        candidateId: 'candidate-live',
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
    const detail = makeDetail(plannedResult);
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

    expect(dependencies.createAdapter).toHaveBeenCalledWith('boss-like');
    expect(adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(dependencies.repo.listResults).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        runId: 'run-1',
      }),
    );
    expect(dependencies.repo.claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-log-1',
    });
    expect(
      (dependencies.repo.claimActionLog as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(adapter.chatCandidate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
    expect(adapter.chatCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(adapter.collectCandidate).not.toHaveBeenCalled();
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        id: 'action-log-1',
        status: 'success',
        browserTrace: null,
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
        stats: expect.objectContaining({ recommendedChat: 1 }),
      }),
    );
    expect(adapter.close).toHaveBeenCalledTimes(1);
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
        stats: expect.objectContaining({ failed: 1 }),
      }),
    );
  });

  it('does not let adapter close failures mask finalized execution state', async () => {
    const adapter = makeAdapter({
      close: jest.fn().mockRejectedValue(new Error('close failed')),
    });
    const dependencies = makeDependencies(adapter);
    dependencies.repo.getRun = jest.fn().mockResolvedValue(
      makeRun({
        id: 'run-1',
        status: 'success',
        searchPlan,
        evaluationSchema,
      }),
    );
    dependencies.repo.listResults = jest.fn().mockResolvedValue([]);

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
