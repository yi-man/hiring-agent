/** @jest-environment node */

import {
  CandidateActionInProgressError,
  STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
  STALE_CANDIDATE_ACTION_TIMEOUT_MS,
  claimCandidateActionLog,
  claimJobDescriptionForCandidateOutreach,
  claimRetryableCollectActionLog,
  createCandidateActionLog,
  createCandidateScreeningRunEvent,
  createCandidateScreeningRun,
  createOrReuseCandidateResume,
  findCandidateResumeByHash,
  getCandidateScreeningDetail,
  getCandidateScreeningRun,
  getCandidateTrackingOverview,
  listCandidateInterviewRecords,
  listCandidateResumeLibrary,
  listCandidateScreeningRunEvents,
  listCandidateScreeningRuns,
  listCandidateScreeningResults,
  replaceCandidateResumeChunks,
  searchCandidateResumeChunks,
  updateCandidateActionLog,
  updateCandidateInterviewProgress,
  updateCandidateScreeningRun,
  upsertCandidateScreeningResult,
  upsertCandidateWithIdentity,
} from './repo';

type PrismaMock = {
  candidate: {
    findFirst: jest.Mock;
    upsert: jest.Mock;
  };
  candidateResume: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  candidateInterviewFeedback: {
    findMany: jest.Mock;
  };
  candidateResumeChunk: {
    deleteMany: jest.Mock;
  };
  candidateScreeningRun: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  candidateScreeningRunEvent: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  publishSkill: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  candidateScreeningResult: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  candidateActionLog: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    candidateResume: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    candidateInterviewFeedback: {
      findMany: jest.fn(),
    },
    candidateResumeChunk: {
      deleteMany: jest.fn(),
    },
    candidateScreeningRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    candidateScreeningRunEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    publishSkill: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    candidateScreeningResult: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    candidateActionLog: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as { prisma: PrismaMock };

const createdAt = new Date('2026-01-02T03:04:05.000Z');
const updatedAt = new Date('2026-01-03T03:04:05.000Z');
const resumeLibraryOrderBy = [{ fetchedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];

function mockCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    userId: 'u1',
    displayName: 'Ada',
    currentTitle: 'Frontend Lead',
    currentCompany: 'Analytical Engines',
    location: 'Remote',
    experienceYears: 8,
    sourcePlatform: 'boss-like',
    platformCandidateId: 'p-1',
    profileUrl: 'https://example.test/ada',
    identityKey: 'Ada|Analytical Engines',
    identityHash: 'hash-1',
    lastActiveAt: null,
    contacted: true,
    replied: true,
    lastContactAt: updatedAt,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function mockResume(overrides: Record<string, unknown> = {}) {
  const candidateId =
    typeof overrides.candidateId === 'string' ? overrides.candidateId : 'candidate-1';

  return {
    id: `resume-${candidateId}`,
    userId: 'u1',
    candidateId,
    sourcePlatform: 'boss-like',
    profileUrl: null,
    rawText: 'Resume text',
    structuredSummary: null,
    resumeHash: `hash-${candidateId}`,
    fetchedAt: updatedAt,
    createdAt,
    candidate: mockCandidate({
      id: candidateId,
      displayName: candidateId === 'candidate-1' ? 'Ada' : 'Grace',
      identityKey: candidateId,
      identityHash: `hash-${candidateId}`,
    }),
    ...overrides,
  };
}

function mockJobDescription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'jd-1',
    userId: 'u1',
    department: '技术部',
    position: '高级前端工程师',
    positionDescription: 'Build UI',
    tone: 'tech',
    status: 'published',
    salaryRange: null,
    workLocations: null,
    content: { title: '高级前端工程师' },
    evaluation: null,
    generationMeta: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function mockScreeningResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'result-1',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'candidate-1',
    resumeId: 'resume-candidate-1',
    source: 'both',
    tags: {
      skills: [],
      domainKnowledge: [],
      generalAbility: [],
      risk: [],
      activity: [],
      custom: [],
    },
    scoreDetail: { skill: 90, domain: 80, ability: 88, risk: 95, llmBonus: 0, total: 89 },
    finalScore: 89,
    rank: 1,
    decisionAction: 'chat',
    decisionPriority: 'high',
    decisionReason: 'Strong fit',
    actionPlan: null,
    actionStatus: 'planned',
    interviewStage: 'interviewing',
    notes: null,
    createdAt,
    updatedAt,
    jobDescription: mockJobDescription(),
    ...overrides,
  };
}

describe('candidate screening repository', () => {
  beforeEach(() => {
    prismaMock.candidate.findFirst.mockReset();
    prismaMock.candidate.upsert.mockReset();
    prismaMock.candidateResume.create.mockReset();
    prismaMock.candidateResume.findFirst.mockReset();
    prismaMock.candidateResume.findMany.mockReset();
    prismaMock.candidateResume.upsert.mockReset();
    prismaMock.candidateInterviewFeedback.findMany.mockReset();
    prismaMock.candidateResumeChunk.deleteMany.mockReset();
    prismaMock.candidateScreeningRun.create.mockReset();
    prismaMock.candidateScreeningRun.findFirst.mockReset();
    prismaMock.candidateScreeningRun.findMany.mockReset();
    prismaMock.candidateScreeningRun.updateMany.mockReset();
    prismaMock.candidateScreeningRunEvent.create.mockReset();
    prismaMock.candidateScreeningRunEvent.findMany.mockReset();
    prismaMock.publishSkill.findUnique.mockReset();
    prismaMock.publishSkill.findMany.mockReset();
    prismaMock.candidateScreeningResult.create.mockReset();
    prismaMock.candidateScreeningResult.findFirst.mockReset();
    prismaMock.candidateScreeningResult.findMany.mockReset();
    prismaMock.candidateScreeningResult.upsert.mockReset();
    prismaMock.candidateScreeningResult.updateMany.mockReset();
    prismaMock.candidateActionLog.findFirst.mockReset();
    prismaMock.candidateActionLog.findMany.mockReset();
    prismaMock.candidateActionLog.upsert.mockReset();
    prismaMock.candidateActionLog.updateMany.mockReset();
    prismaMock.$executeRaw.mockReset();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it('creates a screening run scoped to user and JD', async () => {
    prismaMock.candidateScreeningRun.create.mockResolvedValueOnce({
      id: 'run-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      status: 'pending',
      currentStage: 'planning',
      skillId: null,
      currentWorkflowStep: null,
      searchPlan: { keywords: ['React'] },
      evaluationSchema: { skills: ['React'] },
      stats: { fetched: 0 },
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
      updatedAt,
    });

    const result = await createCandidateScreeningRun({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      currentStage: 'planning',
      searchPlan: { keywords: ['React'], filters: {}, priorityTags: [], retrievalQuery: 'React' },
      evaluationSchema: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
      },
      stats: {
        fetched: 0,
        deduped: 0,
        stored: 0,
        vectorRecalled: 0,
        evaluated: 0,
        recommendedChat: 0,
        recommendedCollect: 0,
        skipped: 0,
        failed: 0,
      },
    });

    expect(prismaMock.candidateScreeningRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        mode: 'dry_run',
        currentStage: 'planning',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        skillId: null,
        currentWorkflowStep: null,
        createdAt: createdAt.toISOString(),
      }),
    );
  });

  it('persists workflow identity and current browser step on a screening run', async () => {
    prismaMock.candidateScreeningRun.create.mockResolvedValueOnce({
      id: 'run-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      status: 'pending',
      currentStage: 'searching_live',
      skillId: 'screen-candidates-v1',
      currentWorkflowStep: 'search_candidates',
      searchPlan: null,
      evaluationSchema: null,
      stats: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
      updatedAt,
    });

    const run = await createCandidateScreeningRun({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      skillId: 'screen-candidates-v1',
      currentWorkflowStep: 'search_candidates',
    });

    expect(prismaMock.candidateScreeningRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillId: 'screen-candidates-v1',
        currentWorkflowStep: 'search_candidates',
      }),
    });
    expect(run).toEqual(
      expect.objectContaining({
        skillId: 'screen-candidates-v1',
        currentWorkflowStep: 'search_candidates',
      }),
    );
  });

  it('returns the exact persisted workflow metadata for a linked screening run', async () => {
    prismaMock.candidateScreeningRun.findFirst.mockResolvedValueOnce({
      id: 'run-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      status: 'running',
      currentStage: 'searching_live',
      skillId: 'screen-candidates-v2',
      currentWorkflowStep: 'search_candidates',
      searchPlan: null,
      evaluationSchema: null,
      stats: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
      updatedAt,
    });
    prismaMock.publishSkill.findUnique.mockResolvedValueOnce({
      id: 'screen-candidates-v2',
      name: 'screen_candidates',
      version: 2,
    });

    const run = await getCandidateScreeningRun({
      userId: 'u1',
      runId: 'run-1',
    });

    expect(run).toEqual(
      expect.objectContaining({
        skillId: 'screen-candidates-v2',
        workflow: { name: 'screen_candidates', version: 2 },
      }),
    );
    expect(prismaMock.publishSkill.findUnique).toHaveBeenCalledWith({
      where: { id: 'screen-candidates-v2' },
      select: { name: true, version: true },
    });
  });

  it('hydrates workflow metadata for a run list with one batched query', async () => {
    const baseRun = {
      id: 'run-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      status: 'success',
      currentStage: 'finalizing',
      currentWorkflowStep: null,
      searchPlan: null,
      evaluationSchema: null,
      stats: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: updatedAt,
      createdAt,
      updatedAt,
    };
    prismaMock.candidateScreeningRun.findMany.mockResolvedValueOnce([
      { ...baseRun, skillId: 'screen-v2' },
      { ...baseRun, id: 'run-2', skillId: 'screen-v3' },
    ]);
    prismaMock.publishSkill.findMany.mockResolvedValueOnce([
      { id: 'screen-v2', name: 'screen_candidates', version: 2 },
      { id: 'screen-v3', name: 'screen_candidates', version: 3 },
    ]);

    const runs = await listCandidateScreeningRuns({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
    });

    expect(prismaMock.candidateScreeningRun.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', jobDescriptionId: 'jd-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(prismaMock.publishSkill.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.publishSkill.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['screen-v2', 'screen-v3'] } },
      select: { id: true, name: true, version: true },
    });
    expect(runs.map((run) => run.workflow)).toEqual([
      { name: 'screen_candidates', version: 2 },
      { name: 'screen_candidates', version: 3 },
    ]);
  });

  it('keeps a missing linked workflow nullable for compatibility', async () => {
    prismaMock.candidateScreeningRun.findFirst.mockResolvedValueOnce({
      id: 'run-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      status: 'success',
      currentStage: 'finalizing',
      skillId: 'removed-workflow',
      currentWorkflowStep: null,
      searchPlan: null,
      evaluationSchema: null,
      stats: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt,
      updatedAt,
    });
    prismaMock.publishSkill.findUnique.mockResolvedValueOnce(null);

    const run = await getCandidateScreeningRun({
      userId: 'u1',
      runId: 'run-1',
    });

    expect(run).toEqual(expect.objectContaining({ skillId: 'removed-workflow', workflow: null }));
  });

  it('updates workflow fields only when they are provided', async () => {
    prismaMock.candidateScreeningRun.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await updateCandidateScreeningRun({
      userId: 'u1',
      runId: 'run-1',
      skillId: 'screen-candidates-v1',
      currentWorkflowStep: 'search_candidates',
    });
    await updateCandidateScreeningRun({ userId: 'u1', runId: 'run-1' });
    await updateCandidateScreeningRun({
      userId: 'u1',
      runId: 'run-1',
      skillId: null,
      currentWorkflowStep: null,
    });

    expect(prismaMock.candidateScreeningRun.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'run-1', userId: 'u1' },
      data: {
        skillId: 'screen-candidates-v1',
        currentWorkflowStep: 'search_candidates',
      },
    });
    expect(prismaMock.candidateScreeningRun.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'run-1', userId: 'u1' },
      data: {},
    });
    expect(prismaMock.candidateScreeningRun.updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: 'run-1', userId: 'u1' },
      data: { skillId: null, currentWorkflowStep: null },
    });
  });

  it('creates and lists run events scoped to user and run', async () => {
    const runEvent = {
      id: 'event-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      stage: 'evaluating',
      level: 'info',
      message: '完成评估：Ada',
      detail: {
        candidateName: 'Ada',
        scoreDetail: { skill: 90, domain: 80, ability: 88, risk: 95, llmBonus: 0, total: 89 },
      },
      createdAt,
    };
    prismaMock.candidateScreeningRunEvent.create.mockResolvedValueOnce(runEvent);
    prismaMock.candidateScreeningRunEvent.findMany.mockResolvedValueOnce([runEvent]);

    const created = await createCandidateScreeningRunEvent({
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      stage: 'evaluating',
      level: 'info',
      message: '完成评估：Ada',
      detail: runEvent.detail,
    });
    const events = await listCandidateScreeningRunEvents({
      userId: 'u1',
      runId: 'run-1',
      limit: 100,
    });

    expect(prismaMock.candidateScreeningRunEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        stage: 'evaluating',
        level: 'info',
        message: '完成评估：Ada',
      }),
    });
    expect(prismaMock.candidateScreeningRunEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', runId: 'run-1' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    expect(created.detail?.candidateName).toBe('Ada');
    expect(events[0]?.message).toBe('完成评估：Ada');
  });

  it('fills missing action message on historical executing action events from action logs', async () => {
    const runEvent = {
      id: 'event-action',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      stage: 'executing_actions',
      level: 'success',
      message: '动作执行成功：Ada',
      detail: {
        candidateName: 'Ada',
        action: 'chat',
        errorMessage: null,
      },
      createdAt,
    };
    prismaMock.candidateScreeningRunEvent.findMany.mockResolvedValueOnce([runEvent]);
    prismaMock.candidateActionLog.findMany.mockResolvedValueOnce([
      {
        candidateId: 'candidate-1',
        action: 'chat',
        message: '你好 Ada，我们正在招聘高级后端工程师，想进一步沟通一下。',
      },
    ]);

    const events = await listCandidateScreeningRunEvents({
      userId: 'u1',
      runId: 'run-1',
      limit: 100,
    });

    expect(prismaMock.candidateActionLog.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        runId: 'run-1',
        candidateId: { in: ['candidate-1'] },
        message: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        candidateId: true,
        action: true,
        message: true,
      },
    });
    expect(events[0]?.detail?.actionMessage).toBe(
      '你好 Ada，我们正在招聘高级后端工程师，想进一步沟通一下。',
    );
  });

  it('builds a cross-JD candidate tracking overview scoped to user', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      {
        id: 'result-1',
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        source: 'both',
        tags: { skills: ['Java'] },
        scoreDetail: { total: 92 },
        finalScore: 92,
        rank: 1,
        decisionAction: 'skip',
        decisionPriority: 'high',
        decisionReason: 'Strong backend match',
        actionPlan: null,
        actionStatus: 'planned',
        interviewStage: 'interviewing',
        notes: '一面中',
        createdAt,
        updatedAt,
        candidate: {
          id: 'candidate-1',
          userId: 'u1',
          displayName: 'Ada',
          currentTitle: 'Senior Backend Engineer',
          currentCompany: 'Acme',
          location: 'Shanghai',
          experienceYears: 8,
          sourcePlatform: 'boss-like',
          platformCandidateId: 'p-1',
          profileUrl: '/employer/resumes/ada',
          identityKey: 'Ada|Acme',
          identityHash: 'hash-1',
          lastActiveAt: null,
          contacted: false,
          replied: false,
          lastContactAt: null,
          createdAt,
          updatedAt,
        },
        resume: null,
        jobDescription: {
          id: 'jd-1',
          userId: 'u1',
          department: '技术部',
          position: '高级后端工程师',
          positionDescription: 'Build backend services',
          tone: 'tech',
          status: 'published',
          content: { title: '高级后端工程师' },
          evaluation: null,
          generationMeta: null,
          createdAt,
          updatedAt,
        },
      },
      {
        id: 'result-2',
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-2',
        resumeId: null,
        source: 'live_search',
        tags: {},
        scoreDetail: { total: 55 },
        finalScore: 55,
        rank: 2,
        decisionAction: 'chat',
        decisionPriority: 'low',
        decisionReason: 'Too junior',
        actionPlan: null,
        actionStatus: 'planned',
        interviewStage: 'onboarded',
        notes: null,
        createdAt,
        updatedAt,
        candidate: {
          id: 'candidate-2',
          userId: 'u1',
          displayName: 'Grace',
          currentTitle: null,
          currentCompany: null,
          location: null,
          experienceYears: null,
          sourcePlatform: 'boss-like',
          platformCandidateId: 'p-2',
          profileUrl: null,
          identityKey: 'Grace',
          identityHash: 'hash-2',
          lastActiveAt: null,
          contacted: false,
          replied: false,
          lastContactAt: null,
          createdAt,
          updatedAt,
        },
        resume: null,
        jobDescription: {
          id: 'jd-1',
          userId: 'u1',
          department: '技术部',
          position: '高级后端工程师',
          positionDescription: 'Build backend services',
          tone: 'tech',
          status: 'published',
          content: { title: '高级后端工程师' },
          evaluation: null,
          generationMeta: null,
          createdAt,
          updatedAt,
        },
      },
    ]);

    const overview = await getCandidateTrackingOverview({ userId: 'u1', limit: 100 });

    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { candidate: true, resume: true, jobDescription: true },
      orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
      take: 100,
    });
    expect(overview.jobs).toEqual([
      {
        jobDescription: {
          id: 'jd-1',
          department: '技术部',
          position: '高级后端工程师',
          status: 'published',
          title: '高级后端工程师',
          updatedAt: updatedAt.toISOString(),
        },
        totalCandidates: 2,
        activeCandidates: 1,
        interviewingCandidates: 1,
        skippedCandidates: 1,
        latestCandidateUpdatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(overview.candidates[0]).toMatchObject({
      id: 'result-1',
      candidateId: 'candidate-1',
      jobDescription: {
        id: 'jd-1',
        position: '高级后端工程师',
      },
    });
  });

  it('lists latest candidate resumes with mounted JD summaries', async () => {
    prismaMock.candidateResume.findMany.mockResolvedValueOnce([
      {
        id: 'resume-1',
        userId: 'u1',
        candidateId: 'candidate-1',
        sourcePlatform: 'boss-like',
        profileUrl: 'https://example.test/ada',
        rawText: 'TypeScript React product engineering leadership',
        structuredSummary: { skills: ['TypeScript', 'React'] },
        resumeHash: 'hash-new',
        fetchedAt: updatedAt,
        createdAt,
        candidate: {
          id: 'candidate-1',
          userId: 'u1',
          displayName: 'Ada',
          currentTitle: 'Frontend Lead',
          currentCompany: 'Analytical Engines',
          location: 'Remote',
          experienceYears: 8,
          sourcePlatform: 'boss-like',
          platformCandidateId: 'p-1',
          profileUrl: 'https://example.test/ada',
          identityKey: 'Ada|Analytical Engines',
          identityHash: 'hash-1',
          lastActiveAt: null,
          contacted: true,
          replied: true,
          lastContactAt: updatedAt,
          createdAt,
          updatedAt,
        },
      },
      {
        id: 'resume-old',
        userId: 'u1',
        candidateId: 'candidate-1',
        sourcePlatform: 'boss-like',
        profileUrl: null,
        rawText: 'Old resume',
        structuredSummary: null,
        resumeHash: 'hash-old',
        fetchedAt: createdAt,
        createdAt,
        candidate: {
          id: 'candidate-1',
          userId: 'u1',
          displayName: 'Ada',
          currentTitle: 'Frontend Lead',
          currentCompany: 'Analytical Engines',
          location: 'Remote',
          experienceYears: 8,
          sourcePlatform: 'boss-like',
          platformCandidateId: 'p-1',
          profileUrl: 'https://example.test/ada',
          identityKey: 'Ada|Analytical Engines',
          identityHash: 'hash-1',
          lastActiveAt: null,
          contacted: true,
          replied: true,
          lastContactAt: updatedAt,
          createdAt,
          updatedAt,
        },
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      {
        id: 'result-1',
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        source: 'both',
        tags: {
          skills: [],
          domainKnowledge: [],
          generalAbility: [],
          risk: [],
          activity: [],
          custom: [],
        },
        scoreDetail: { skill: 90, domain: 80, ability: 88, risk: 95, llmBonus: 0, total: 89 },
        finalScore: 89,
        rank: 1,
        decisionAction: 'chat',
        decisionPriority: 'high',
        decisionReason: 'Strong fit',
        actionPlan: null,
        actionStatus: 'planned',
        interviewStage: 'interviewing',
        notes: '下周一面',
        createdAt,
        updatedAt,
        jobDescription: {
          id: 'jd-1',
          userId: 'u1',
          department: '技术部',
          position: '高级前端工程师',
          positionDescription: 'Build UI',
          tone: 'tech',
          status: 'published',
          salaryRange: null,
          workLocations: null,
          content: { title: '高级前端工程师' },
          evaluation: null,
          generationMeta: null,
          createdAt,
          updatedAt,
        },
      },
    ]);

    const resumes = await listCandidateResumeLibrary({ userId: 'u1', limit: 20 });

    expect(prismaMock.candidateResume.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { candidate: true },
      orderBy: resumeLibraryOrderBy,
      take: 60,
    });
    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', resumeId: { in: ['resume-1'] } },
      include: { jobDescription: true },
      orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
    });
    expect(resumes).toHaveLength(1);
    expect(resumes[0]).toMatchObject({
      resume: { id: 'resume-1', candidateId: 'candidate-1' },
      candidate: { displayName: 'Ada' },
      mountedJobs: [
        {
          screeningResultId: 'result-1',
          candidateId: 'candidate-1',
          resumeId: 'resume-1',
          finalScore: 89,
          interviewStage: 'interviewing',
          decisionAction: 'chat',
          jobDescription: {
            id: 'jd-1',
            position: '高级前端工程师',
          },
        },
      ],
    });
  });

  it('lists resumes without mounted JDs', async () => {
    prismaMock.candidateResume.findMany.mockResolvedValueOnce([
      {
        id: 'resume-2',
        userId: 'u1',
        candidateId: 'candidate-2',
        sourcePlatform: 'boss-like',
        profileUrl: null,
        rawText: 'Backend Go PostgreSQL',
        structuredSummary: null,
        resumeHash: 'hash-2',
        fetchedAt: updatedAt,
        createdAt,
        candidate: {
          id: 'candidate-2',
          userId: 'u1',
          displayName: 'Grace',
          currentTitle: 'Backend Engineer',
          currentCompany: null,
          location: null,
          experienceYears: null,
          sourcePlatform: 'boss-like',
          platformCandidateId: null,
          profileUrl: null,
          identityKey: 'Grace',
          identityHash: 'hash-2',
          lastActiveAt: null,
          contacted: false,
          replied: false,
          lastContactAt: null,
          createdAt,
          updatedAt,
        },
      },
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    const resumes = await listCandidateResumeLibrary({ userId: 'u1', limit: 20 });

    expect(resumes[0]?.mountedJobs).toEqual([]);
  });

  it('continues fetching resumes until enough unique candidates are found', async () => {
    const duplicatePage = Array.from({ length: 6 }, (_, index) =>
      mockResume({
        id: `resume-candidate-1-${index}`,
        candidateId: 'candidate-1',
        resumeHash: `hash-candidate-1-${index}`,
      }),
    );
    prismaMock.candidateResume.findMany.mockResolvedValueOnce(duplicatePage).mockResolvedValueOnce([
      mockResume({
        id: 'resume-candidate-2',
        candidateId: 'candidate-2',
        resumeHash: 'hash-candidate-2',
      }),
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    const resumes = await listCandidateResumeLibrary({ userId: 'u1', limit: 2 });

    expect(prismaMock.candidateResume.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'u1' },
      include: { candidate: true },
      orderBy: resumeLibraryOrderBy,
      take: 6,
    });
    expect(prismaMock.candidateResume.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1' },
      include: { candidate: true },
      orderBy: resumeLibraryOrderBy,
      take: 6,
      skip: 6,
    });
    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        resumeId: { in: ['resume-candidate-1-0', 'resume-candidate-2'] },
      },
      include: { jobDescription: true },
      orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
    });
    expect(resumes.map((item) => item.candidate.id)).toEqual(['candidate-1', 'candidate-2']);
  });

  it('clamps list limits for resource queries', async () => {
    for (const [limit, take] of [
      [Number.NaN, 600],
      [0, 3],
      [-10, 3],
      [1.8, 3],
      [9999, 1500],
    ]) {
      prismaMock.candidateResume.findMany.mockResolvedValueOnce([]);

      await listCandidateResumeLibrary({ userId: 'u1', limit });

      expect(prismaMock.candidateResume.findMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1' },
        include: { candidate: true },
        orderBy: resumeLibraryOrderBy,
        take,
      });
    }

    for (const [limit, take] of [
      [Number.NaN, 200],
      [0, 1],
      [1.8, 1],
      [9999, 500],
    ]) {
      prismaMock.candidateInterviewFeedback.findMany.mockResolvedValueOnce([]);

      await listCandidateInterviewRecords({ userId: 'u1', limit });

      expect(prismaMock.candidateInterviewFeedback.findMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1' },
        include: { candidate: true, jobDescription: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take,
      });
    }

    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    await getCandidateTrackingOverview({ userId: 'u1', limit: Number.NaN });

    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1' },
      include: { candidate: true, resume: true, jobDescription: true },
      orderBy: [{ updatedAt: 'desc' }, { finalScore: 'desc' }],
      take: 200,
    });
  });

  it('lists only mounted jobs for the displayed resume after fetching later resume pages', async () => {
    const duplicatePage = Array.from({ length: 6 }, (_, index) =>
      mockResume({
        id: `resume-candidate-1-${index}`,
        candidateId: 'candidate-1',
        resumeHash: `hash-candidate-1-${index}`,
      }),
    );
    prismaMock.candidateResume.findMany.mockResolvedValueOnce(duplicatePage).mockResolvedValueOnce([
      mockResume({
        id: 'resume-candidate-2',
        candidateId: 'candidate-2',
        resumeHash: 'hash-candidate-2',
      }),
    ]);
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([
      mockScreeningResult({
        id: 'result-newer-non-exact',
        candidateId: 'candidate-2',
        resumeId: 'resume-candidate-2-old',
        updatedAt: new Date('2026-01-05T03:04:05.000Z'),
      }),
      mockScreeningResult({
        id: 'result-exact',
        candidateId: 'candidate-2',
        resumeId: 'resume-candidate-2',
        updatedAt,
      }),
    ]);

    const resumes = await listCandidateResumeLibrary({ userId: 'u1', limit: 2 });
    const candidate = resumes.find((item) => item.candidate.id === 'candidate-2');

    expect(candidate?.mountedJobs.map((job) => job.screeningResultId)).toEqual(['result-exact']);
  });

  it('lists interview records with candidate and JD context', async () => {
    prismaMock.candidateInterviewFeedback.findMany.mockResolvedValueOnce([
      {
        id: 'feedback-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        stage: 'first_interview',
        interviewer: 'Grace Hopper',
        rating: 4,
        dimensionRatings: [
          {
            dimension: 'core_competency',
            score: 4,
            evidence: '能够独立完成核心前端任务',
          },
        ],
        pros: ['TypeScript 扎实'],
        cons: ['系统设计需要追问'],
        decision: 'pass',
        notes: '建议二面',
        createdAt,
        updatedAt,
        candidate: {
          id: 'candidate-1',
          userId: 'u1',
          displayName: 'Ada',
          currentTitle: 'Frontend Lead',
          currentCompany: 'Analytical Engines',
          location: 'Remote',
          experienceYears: 8,
          sourcePlatform: 'boss-like',
          platformCandidateId: 'p-1',
          profileUrl: 'https://example.test/ada',
          identityKey: 'Ada|Analytical Engines',
          identityHash: 'hash-1',
          lastActiveAt: null,
          contacted: true,
          replied: true,
          lastContactAt: updatedAt,
          createdAt,
          updatedAt,
        },
        jobDescription: {
          id: 'jd-1',
          userId: 'u1',
          department: '技术部',
          position: '高级前端工程师',
          positionDescription: 'Build UI',
          tone: 'tech',
          status: 'published',
          salaryRange: null,
          workLocations: null,
          content: { title: '高级前端工程师' },
          evaluation: null,
          generationMeta: null,
          createdAt,
          updatedAt,
        },
      },
    ]);

    const records = await listCandidateInterviewRecords({ userId: 'u1', limit: 20 });

    expect(prismaMock.candidateInterviewFeedback.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { candidate: true, jobDescription: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    expect(records[0]).toMatchObject({
      id: 'feedback-1',
      candidate: { id: 'candidate-1', displayName: 'Ada' },
      jobDescription: { id: 'jd-1', position: '高级前端工程师' },
      stage: 'first_interview',
      decision: 'pass',
      dimensionRatings: [
        {
          dimension: 'core_competency',
          score: 4,
          evidence: '能够独立完成核心前端任务',
        },
      ],
    });
  });

  it('upserts candidates by user, platform, and identity hash', async () => {
    prismaMock.candidate.upsert.mockResolvedValueOnce({
      id: 'candidate-1',
      userId: 'u1',
      displayName: 'Ada',
      currentTitle: 'Frontend Engineer',
      currentCompany: 'Acme',
      location: 'Shanghai',
      experienceYears: 5,
      sourcePlatform: 'boss-like',
      platformCandidateId: 'p-1',
      profileUrl: 'https://example.test/ada',
      identityKey: 'Ada|Acme',
      identityHash: 'hash-1',
      lastActiveAt: null,
      contacted: false,
      replied: false,
      lastContactAt: null,
      createdAt,
      updatedAt,
    });

    await upsertCandidateWithIdentity({
      userId: 'u1',
      displayName: 'Ada',
      currentTitle: 'Frontend Engineer',
      currentCompany: 'Acme',
      location: 'Shanghai',
      experienceYears: 5,
      sourcePlatform: 'boss-like',
      platformCandidateId: 'p-1',
      profileUrl: 'https://example.test/ada',
      identityKey: 'Ada|Acme',
      identityHash: 'hash-1',
      lastActiveAt: null,
    });

    expect(prismaMock.candidate.upsert).toHaveBeenCalledWith({
      where: {
        userId_sourcePlatform_identityHash: {
          userId: 'u1',
          sourcePlatform: 'boss-like',
          identityHash: 'hash-1',
        },
      },
      create: expect.objectContaining({
        userId: 'u1',
        sourcePlatform: 'boss-like',
        identityHash: 'hash-1',
      }),
      update: expect.objectContaining({
        displayName: 'Ada',
        currentTitle: 'Frontend Engineer',
        platformCandidateId: 'p-1',
      }),
    });
  });

  it('does not clear omitted candidate optional fields on identity refresh', async () => {
    prismaMock.candidate.upsert.mockResolvedValueOnce({
      id: 'candidate-1',
      userId: 'u1',
      displayName: 'Ada',
      currentTitle: null,
      currentCompany: 'Existing Co',
      location: 'Shanghai',
      experienceYears: 5,
      sourcePlatform: 'boss-like',
      platformCandidateId: null,
      profileUrl: 'https://example.test/ada',
      identityKey: 'Ada|Existing Co',
      identityHash: 'hash-1',
      lastActiveAt: null,
      contacted: false,
      replied: false,
      lastContactAt: null,
      createdAt,
      updatedAt,
    });

    await upsertCandidateWithIdentity({
      userId: 'u1',
      displayName: 'Ada',
      sourcePlatform: 'boss-like',
      identityKey: 'Ada|Existing Co',
      identityHash: 'hash-1',
      currentTitle: null,
    });

    const call = prismaMock.candidate.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(call.update).toMatchObject({
      displayName: 'Ada',
      currentTitle: null,
      identityKey: 'Ada|Existing Co',
    });
    expect(call.update).not.toHaveProperty('currentCompany');
    expect(call.update).not.toHaveProperty('profileUrl');
    expect(call.update).not.toHaveProperty('experienceYears');
  });

  it('reuses identical resume snapshots by candidate and resume hash', async () => {
    prismaMock.candidateResume.findFirst.mockResolvedValueOnce({
      id: 'resume-1',
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: { skills: ['React'] },
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
      createdAt,
    });

    const result = await createOrReuseCandidateResume({
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: { skills: ['React'] },
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
    });

    expect(prismaMock.candidateResume.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', candidateId: 'candidate-1', resumeHash: 'resume-hash-1' },
    });
    expect(prismaMock.candidateResume.create).not.toHaveBeenCalled();
    expect(prismaMock.candidateResume.upsert).not.toHaveBeenCalled();
    expect(result.fetchedAt).toBe(createdAt.toISOString());
  });

  it('creates resume snapshots only after scoped same-user reuse lookup', async () => {
    prismaMock.candidateResume.findFirst.mockResolvedValueOnce(null);
    prismaMock.candidateResume.create.mockResolvedValueOnce({
      id: 'resume-1',
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: { skills: ['React'] },
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
      createdAt,
    });
    await createOrReuseCandidateResume({
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: { skills: ['React'] },
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
    });

    expect(prismaMock.candidateResume.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', candidateId: 'candidate-1', resumeHash: 'resume-hash-1' },
    });
    expect(prismaMock.candidateResume.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        candidateId: 'candidate-1',
        resumeHash: 'resume-hash-1',
      }),
    });
    expect(prismaMock.candidateResume.upsert).not.toHaveBeenCalled();
  });

  it('retries scoped resume reuse when create races on unique constraint', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const racedResume = {
      id: 'resume-1',
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: { skills: ['React'] },
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
      createdAt,
    };
    prismaMock.candidateResume.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedResume);
    prismaMock.candidateResume.create.mockRejectedValueOnce(uniqueError);

    const result = await createOrReuseCandidateResume({
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: { skills: ['React'] },
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
    });

    expect(result.id).toBe('resume-1');
    expect(prismaMock.candidateResume.findFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: 'u1', candidateId: 'candidate-1', resumeHash: 'resume-hash-1' },
    });
    expect(prismaMock.candidateResume.findFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1', candidateId: 'candidate-1', resumeHash: 'resume-hash-1' },
    });
    expect(prismaMock.candidateResume.upsert).not.toHaveBeenCalled();
  });

  it('finds an existing resume snapshot by user, candidate, and hash', async () => {
    prismaMock.candidateResume.findFirst.mockResolvedValueOnce({
      id: 'resume-1',
      userId: 'u1',
      candidateId: 'candidate-1',
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.test/ada',
      rawText: 'resume text',
      structuredSummary: null,
      resumeHash: 'resume-hash-1',
      fetchedAt: createdAt,
      createdAt,
    });

    const result = await findCandidateResumeByHash({
      userId: 'u1',
      candidateId: 'candidate-1',
      resumeHash: 'resume-hash-1',
    });

    expect(prismaMock.candidateResume.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', candidateId: 'candidate-1', resumeHash: 'resume-hash-1' },
    });
    expect(result?.id).toBe('resume-1');
  });

  it('replaces resume chunks with raw pgvector inserts inside a transaction', async () => {
    const tx = {
      candidateResumeChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await replaceCandidateResumeChunks({
      userId: 'u1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      embeddingModel: 'text-embedding-3-small',
      chunks: [
        {
          id: 'chunk-1',
          chunkIndex: 0,
          content: 'resume chunk',
          tokenEstimate: 12,
          embedding: [0.1, 0.2],
        },
      ],
    });

    expect(tx.candidateResumeChunk.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', candidateId: 'candidate-1', resumeId: 'resume-1' },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const rawSql = tx.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
    const sqlText = String(rawSql.join(' '));
    expect(sqlText).toContain('INSERT INTO "public"."candidate_resume_chunks"');
    expect(sqlText).toContain('"embedding"');
    expect(sqlText).toContain('::vector');
  });

  it('searches candidate chunks with user, model, dimension, and contact filters', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'chunk-1',
        candidateId: 'candidate-1',
        resumeId: 'resume-1',
        userId: 'u1',
        chunkIndex: 0,
        content: 'resume chunk',
        displayName: 'Ada',
        currentTitle: 'Frontend Engineer',
        currentCompany: 'Acme',
        profileUrl: 'https://example.test/ada',
        contacted: false,
        score: '0.91',
      },
    ]);

    const result = await searchCandidateResumeChunks({
      userId: 'u1',
      queryVector: [0.1, 0.2, 0.3],
      embeddingModel: 'text-embedding-3-small',
      topK: 3,
      allowAlreadyContacted: false,
    });

    const sqlText = String(prismaMock.$queryRaw.mock.calls[0][0].strings.join(' '));
    expect(sqlText).toContain('c.user_id =');
    expect(sqlText).toContain('c.embedding_model =');
    expect(sqlText).toContain('c.embedding_dimension =');
    expect(sqlText).toContain('candidate.contacted = false');
    expect(sqlText).toContain('ORDER BY c.embedding <=>');
    expect(result[0]?.score).toBe(0.91);
    expect(result[0]?.contacted).toBe(false);
  });

  it('upserts JD screening results by job description and candidate', async () => {
    prismaMock.candidateScreeningResult.findFirst.mockResolvedValueOnce(null);
    prismaMock.candidateScreeningResult.create.mockResolvedValueOnce({
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'both',
      tags: { skills: ['React'] },
      scoreDetail: { total: 91 },
      finalScore: 91,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'Strong fit',
      actionPlan: { action: 'chat', priority: 'high', message: 'Hi', reason: 'Strong fit' },
      actionStatus: 'planned',
      interviewStage: 'screened',
      notes: null,
      createdAt,
      updatedAt,
    });

    await upsertCandidateScreeningResult({
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'both',
      tags: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      scoreDetail: { skill: 30, domain: 20, ability: 20, risk: 0, llmBonus: 21, total: 91 },
      finalScore: 91,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'Strong fit',
      actionPlan: { action: 'chat', priority: 'high', message: 'Hi', reason: 'Strong fit' },
    });

    expect(prismaMock.candidateScreeningResult.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', jobDescriptionId: 'jd-1', candidateId: 'candidate-1' },
    });
    expect(prismaMock.candidateScreeningResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
      }),
    });
    expect(prismaMock.candidateScreeningResult.upsert).not.toHaveBeenCalled();
  });

  it('does not reset existing progress when refreshing a screening result', async () => {
    const existingResult = {
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'vector_recall',
      tags: { skills: ['React'] },
      scoreDetail: { total: 88 },
      finalScore: 88,
      rank: 2,
      decisionAction: 'chat',
      decisionPriority: 'medium',
      decisionReason: 'Still fits',
      actionPlan: null,
      actionStatus: 'success',
      interviewStage: 'contacted',
      notes: 'Already reached out',
      createdAt,
      updatedAt,
    };
    prismaMock.candidateScreeningResult.findFirst
      .mockResolvedValueOnce(existingResult)
      .mockResolvedValueOnce({ ...existingResult, finalScore: 88, rank: 2 });
    prismaMock.candidateScreeningResult.updateMany.mockResolvedValueOnce({ count: 1 });

    await upsertCandidateScreeningResult({
      userId: 'u1',
      runId: 'run-2',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'vector_recall',
      tags: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      scoreDetail: { skill: 28, domain: 20, ability: 20, risk: 0, llmBonus: 20, total: 88 },
      finalScore: 88,
      rank: 2,
      decisionAction: 'chat',
      decisionPriority: 'medium',
      decisionReason: 'Still fits',
    });

    const call = prismaMock.candidateScreeningResult.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty('actionStatus');
    expect(call.data).not.toHaveProperty('interviewStage');
    expect(call.data).not.toHaveProperty('notes');
  });

  it('falls back to scoring-only fields when a concurrent update reaches a final outcome', async () => {
    const offered = mockScreeningResult({
      interviewStage: 'offer',
      actionStatus: 'success',
      notes: '等待确认入职',
    });
    const onboarded = mockScreeningResult({
      interviewStage: 'onboarded',
      actionStatus: 'success',
      notes: '已确认入职',
    });
    prismaMock.candidateScreeningResult.findFirst
      .mockResolvedValueOnce(offered)
      .mockResolvedValueOnce(onboarded)
      .mockResolvedValueOnce({ ...onboarded, finalScore: 88 });
    prismaMock.candidateScreeningResult.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await upsertCandidateScreeningResult({
      userId: 'u1',
      runId: 'run-2',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      source: 'vector_recall',
      tags: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      scoreDetail: { skill: 28, domain: 20, ability: 20, risk: 0, llmBonus: 20, total: 88 },
      finalScore: 88,
      rank: 2,
      decisionAction: 'chat',
      decisionPriority: 'medium',
      decisionReason: 'Still fits',
      actionPlan: {
        action: 'chat',
        priority: 'medium',
        message: '继续沟通',
        reason: 'Still fits',
      },
      actionStatus: 'planned',
      interviewStage: 'to_contact',
      notes: null,
    });

    expect(prismaMock.candidateScreeningResult.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: offered.id, userId: 'u1', interviewStage: 'offer' },
      data: expect.objectContaining({ interviewStage: 'to_contact', actionStatus: 'planned' }),
    });
    const fallback = prismaMock.candidateScreeningResult.updateMany.mock.calls[1]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(fallback.data).toEqual(expect.objectContaining({ finalScore: 88 }));
    expect(fallback.data).not.toHaveProperty('actionPlan');
    expect(fallback.data).not.toHaveProperty('actionStatus');
    expect(fallback.data).not.toHaveProperty('interviewStage');
    expect(fallback.data).not.toHaveProperty('notes');
  });

  it.each(['onboarded', 'not_joined', 'rejected', 'withdrawn'] as const)(
    'does not overwrite terminal stage %s during a screening refresh',
    async (interviewStage) => {
      const existingResult = mockScreeningResult({
        interviewStage,
        actionStatus: 'success',
        notes: '流程已经结束',
      });
      prismaMock.candidateScreeningResult.findFirst
        .mockResolvedValueOnce(existingResult)
        .mockResolvedValueOnce(existingResult);
      prismaMock.candidateScreeningResult.updateMany.mockResolvedValueOnce({ count: 1 });

      await upsertCandidateScreeningResult({
        userId: 'u1',
        runId: 'run-2',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        source: 'vector_recall',
        tags: {
          skills: ['React'],
          domainKnowledge: [],
          generalAbility: [],
          risk: [],
          activity: [],
          custom: [],
        },
        scoreDetail: { skill: 28, domain: 20, ability: 20, risk: 0, llmBonus: 20, total: 88 },
        finalScore: 88,
        rank: 2,
        decisionAction: 'chat',
        decisionPriority: 'medium',
        decisionReason: 'Still fits',
        actionStatus: 'planned',
        interviewStage: 'to_contact',
        notes: null,
      });

      const call = prismaMock.candidateScreeningResult.updateMany.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(call.data).not.toHaveProperty('actionPlan');
      expect(call.data).not.toHaveProperty('actionStatus');
      expect(call.data).not.toHaveProperty('interviewStage');
      expect(call.data).not.toHaveProperty('notes');
    },
  );

  it('keeps run immutable when refreshing an existing screening result', async () => {
    const existingResult = {
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'live_search',
      tags: { skills: ['React'] },
      scoreDetail: { total: 91 },
      finalScore: 91,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'Strong fit',
      actionPlan: null,
      actionStatus: 'success',
      interviewStage: 'contacted',
      notes: 'Already contacted',
      createdAt,
      updatedAt,
    };
    prismaMock.candidateScreeningResult.findFirst
      .mockResolvedValueOnce(existingResult)
      .mockResolvedValueOnce({ ...existingResult, finalScore: 88, rank: 2 });
    prismaMock.candidateScreeningResult.updateMany.mockResolvedValueOnce({ count: 1 });

    await upsertCandidateScreeningResult({
      userId: 'u1',
      runId: 'run-2',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'vector_recall',
      tags: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      scoreDetail: { skill: 28, domain: 20, ability: 20, risk: 0, llmBonus: 20, total: 88 },
      finalScore: 88,
      rank: 2,
      decisionAction: 'chat',
      decisionPriority: 'medium',
      decisionReason: 'Still fits',
    });

    const updateCall = prismaMock.candidateScreeningResult.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).not.toHaveProperty('runId');
  });

  it('refreshes screening results through user-scoped lookup and update', async () => {
    const existingResult = {
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'live_search',
      tags: { skills: ['React'] },
      scoreDetail: { total: 91 },
      finalScore: 91,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'Strong fit',
      actionPlan: null,
      actionStatus: 'success',
      interviewStage: 'contacted',
      notes: 'Already contacted',
      createdAt,
      updatedAt,
    };
    prismaMock.candidateScreeningResult.findFirst
      .mockResolvedValueOnce(existingResult)
      .mockResolvedValueOnce({ ...existingResult, finalScore: 88 });
    prismaMock.candidateScreeningResult.updateMany.mockResolvedValueOnce({ count: 1 });

    await upsertCandidateScreeningResult({
      userId: 'u1',
      runId: 'run-2',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'vector_recall',
      tags: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      scoreDetail: { skill: 28, domain: 20, ability: 20, risk: 0, llmBonus: 20, total: 88 },
      finalScore: 88,
      rank: 2,
      decisionAction: 'chat',
      decisionPriority: 'medium',
      decisionReason: 'Still fits',
    });

    expect(prismaMock.candidateScreeningResult.findFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: 'u1', jobDescriptionId: 'jd-1', candidateId: 'candidate-1' },
    });
    expect(prismaMock.candidateScreeningResult.updateMany).toHaveBeenCalledWith({
      where: { id: 'result-1', userId: 'u1' },
      data: expect.objectContaining({
        finalScore: 88,
        decisionAction: 'chat',
      }),
    });
    expect(prismaMock.candidateScreeningResult.upsert).not.toHaveBeenCalled();
  });

  it('retries scoped screening result refresh when create races on unique constraint', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const existingResult = {
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'live_search',
      tags: { skills: ['React'] },
      scoreDetail: { total: 91 },
      finalScore: 91,
      rank: 1,
      decisionAction: 'chat',
      decisionPriority: 'high',
      decisionReason: 'Strong fit',
      actionPlan: null,
      actionStatus: 'success',
      interviewStage: 'contacted',
      notes: 'Already contacted',
      createdAt,
      updatedAt,
    };
    prismaMock.candidateScreeningResult.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingResult)
      .mockResolvedValueOnce({ ...existingResult, finalScore: 88, rank: 2 });
    prismaMock.candidateScreeningResult.create.mockRejectedValueOnce(uniqueError);
    prismaMock.candidateScreeningResult.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await upsertCandidateScreeningResult({
      userId: 'u1',
      runId: 'run-2',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      source: 'vector_recall',
      tags: {
        skills: ['React'],
        domainKnowledge: [],
        generalAbility: [],
        risk: [],
        activity: [],
        custom: [],
      },
      scoreDetail: { skill: 28, domain: 20, ability: 20, risk: 0, llmBonus: 20, total: 88 },
      finalScore: 88,
      rank: 2,
      decisionAction: 'chat',
      decisionPriority: 'medium',
      decisionReason: 'Still fits',
    });

    expect(result.id).toBe('result-1');
    expect(prismaMock.candidateScreeningResult.findFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: 'u1', jobDescriptionId: 'jd-1', candidateId: 'candidate-1' },
    });
    expect(prismaMock.candidateScreeningResult.findFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1', jobDescriptionId: 'jd-1', candidateId: 'candidate-1' },
    });
    const updateCall = prismaMock.candidateScreeningResult.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).not.toHaveProperty('runId');
    expect(updateCall.data).not.toHaveProperty('actionStatus');
    expect(updateCall.data).not.toHaveProperty('interviewStage');
    expect(updateCall.data).not.toHaveProperty('notes');
    expect(prismaMock.candidateScreeningResult.upsert).not.toHaveBeenCalled();
  });

  it('updates interview progress inside a JD-scoped transaction', async () => {
    const updated = {
      id: 'result-1',
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      resumeId: null,
      source: 'live_search',
      tags: { skills: [] },
      scoreDetail: { total: 50 },
      finalScore: 50,
      rank: 2,
      decisionAction: 'collect',
      decisionPriority: 'medium',
      decisionReason: 'Need resume',
      actionPlan: null,
      actionStatus: 'planned',
      interviewStage: 'contacted',
      notes: 'Reached out',
      createdAt,
      updatedAt,
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'to_contact' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
      candidateActionLog: { findFirst: jest.fn() },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn().mockResolvedValueOnce(updated),
        count: jest.fn(),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await updateCandidateInterviewProgress({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      interviewStage: 'contacted',
      expectedInterviewStage: 'to_contact',
      notes: 'Reached out',
    });

    expect(tx.candidateScreeningResult.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        id: 'result-1',
        interviewStage: 'to_contact',
      },
      data: { interviewStage: 'contacted', notes: 'Reached out' },
    });
    expect(tx.candidateScreeningResult.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', jobDescriptionId: 'jd-1', candidateId: 'candidate-1' },
    });
    expect(tx.candidateScreeningResult.count).not.toHaveBeenCalled();
    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ interviewStage: 'contacted' }));

    const resultLockSql = tx.$queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] };
    const jobLockSql = tx.$queryRaw.mock.calls[1]?.[0] as { strings?: readonly string[] };
    expect(resultLockSql.strings?.join(' ')).toContain('candidate_screening_results');
    expect(resultLockSql.strings?.join(' ')).toContain('FOR UPDATE');
    expect(jobLockSql.strings?.join(' ')).toContain('job_descriptions');
    expect(jobLockSql.strings?.join(' ')).toContain('FOR UPDATE');
  });

  it.each(['onboarded', 'not_joined', 'rejected', 'withdrawn'] as const)(
    'rejects terminal stage %s while the candidate message processing claim is active',
    async (interviewStage) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
          .mockResolvedValueOnce([
            {
              id: 'jd-1',
              status: 'published',
              hiringTarget: 2,
              hasActiveCandidateMessageProcessing: true,
            },
          ]),
        candidateActionLog: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
          findFirst: jest.fn().mockResolvedValueOnce(null),
        },
        candidateScreeningResult: {
          updateMany: jest.fn(),
          findFirst: jest.fn(),
          count: jest.fn(),
        },
        jobDescription: { updateMany: jest.fn() },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      await expect(
        updateCandidateInterviewProgress({
          userId: 'u1',
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          interviewStage,
          expectedInterviewStage: 'offer',
        }),
      ).rejects.toBeInstanceOf(CandidateActionInProgressError);

      expect(tx.candidateScreeningResult.updateMany).not.toHaveBeenCalled();
      const jobLockSql = tx.$queryRaw.mock.calls[1]?.[0] as { strings?: readonly string[] };
      expect(jobLockSql.strings?.join(' ')).toContain('candidate_conversation_messages');
      expect(jobLockSql.strings?.join(' ')).toContain('candidate_id');
      expect(jobLockSql.strings?.join(' ')).toContain('processing_outcome');
    },
  );

  it('marks a published JD filled when the onboarded count reaches its hiring target', async () => {
    const onboardedResult = mockScreeningResult({ interviewStage: 'onboarded' });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn().mockResolvedValueOnce(onboardedResult),
        count: jest.fn().mockResolvedValueOnce(2),
      },
      jobDescription: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }) },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await updateCandidateInterviewProgress({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      interviewStage: 'onboarded',
      expectedInterviewStage: 'offer',
    });

    expect(tx.candidateScreeningResult.count).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        interviewStage: 'onboarded',
      },
    });
    expect(tx.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'published' },
      data: { status: 'filled', activePublishBatchId: null, publishLeaseExpiresAt: null },
    });
  });

  it.each(['ready_to_publish', 'offline', 'publish_failed'] as const)(
    'marks a %s JD filled when onboarding reaches its hiring target',
    async (status) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
          .mockResolvedValueOnce([{ id: 'jd-1', status, hiringTarget: 2 }]),
        candidateActionLog: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
          findFirst: jest.fn().mockResolvedValueOnce(null),
        },
        candidateScreeningResult: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(mockScreeningResult({ interviewStage: 'onboarded' })),
          count: jest.fn().mockResolvedValueOnce(2),
        },
        jobDescription: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }) },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      await updateCandidateInterviewProgress({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        interviewStage: 'onboarded',
        expectedInterviewStage: 'offer',
      });

      expect(tx.jobDescription.updateMany).toHaveBeenCalledWith({
        where: { id: 'jd-1', userId: 'u1', status },
        data: { status: 'filled', activePublishBatchId: null, publishLeaseExpiresAt: null },
      });
    },
  );

  it('rejects onboarding that would fill a JD while publishing is in progress', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'publishing', hiringTarget: 2 }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValueOnce(2),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      updateCandidateInterviewProgress({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        interviewStage: 'onboarded',
        expectedInterviewStage: 'offer',
      }),
    ).rejects.toBeInstanceOf(CandidateActionInProgressError);

    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
  });

  it('rejects onboarding that would fill a JD while candidate communication is active', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([
          {
            id: 'jd-1',
            status: 'published',
            hiringTarget: 2,
            hasActiveCandidateCommunication: true,
          },
        ]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValueOnce(2),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      updateCandidateInterviewProgress({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        interviewStage: 'onboarded',
        expectedInterviewStage: 'offer',
      }),
    ).rejects.toBeInstanceOf(CandidateActionInProgressError);

    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
    const jobLockSql = tx.$queryRaw.mock.calls[1]?.[0] as { strings?: readonly string[] };
    expect(jobLockSql.strings?.join(' ')).toContain('candidate_conversation_messages');
    expect(jobLockSql.strings?.join(' ')).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
  });

  it('rejects onboarding that would fill a JD while another candidate action is running', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'other-candidate-action' }),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValueOnce(2),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      updateCandidateInterviewProgress({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        interviewStage: 'onboarded',
        expectedInterviewStage: 'offer',
      }),
    ).rejects.toBeInstanceOf(CandidateActionInProgressError);

    expect(tx.candidateActionLog.findFirst).toHaveBeenLastCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        status: 'running',
      },
      select: { id: true },
    });
    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['has no hiring target', { status: 'published', hiringTarget: null }],
    ['is archived', { status: 'archived', hiringTarget: 1 }],
  ])('does not auto-fill a JD that %s', async (_label, job) => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([{ id: 'jd-1', ...job }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(mockScreeningResult({ interviewStage: 'onboarded' })),
        count: jest.fn(),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await updateCandidateInterviewProgress({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      interviewStage: 'onboarded',
      expectedInterviewStage: 'offer',
    });

    expect(tx.candidateScreeningResult.count).not.toHaveBeenCalled();
    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a published JD open while the onboarded count is below target', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(mockScreeningResult({ interviewStage: 'onboarded' })),
        count: jest.fn().mockResolvedValueOnce(1),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await updateCandidateInterviewProgress({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      interviewStage: 'onboarded',
      expectedInterviewStage: 'offer',
    });

    expect(tx.candidateScreeningResult.count).toHaveBeenCalledTimes(1);
    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
  });

  it('does not reopen a filled JD when an onboarding result is corrected', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'onboarded' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'filled', hiringTarget: 1 }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(mockScreeningResult({ interviewStage: 'not_joined' })),
        count: jest.fn(),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await updateCandidateInterviewProgress({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      interviewStage: 'not_joined',
      expectedInterviewStage: 'onboarded',
    });

    expect(tx.candidateScreeningResult.count).not.toHaveBeenCalled();
    expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
  });

  it.each(['onboarded', 'not_joined', 'rejected', 'withdrawn'] as const)(
    'rejects terminal stage %s while an external action is running',
    async (interviewStage) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
          .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
        candidateActionLog: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
          findFirst: jest.fn().mockResolvedValueOnce({ id: 'action-1' }),
        },
        candidateScreeningResult: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          findFirst: jest.fn().mockResolvedValueOnce(mockScreeningResult({ interviewStage })),
          count: jest.fn(),
        },
        jobDescription: { updateMany: jest.fn() },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      await expect(
        updateCandidateInterviewProgress({
          userId: 'u1',
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          interviewStage,
          expectedInterviewStage: 'offer',
        }),
      ).rejects.toBeInstanceOf(CandidateActionInProgressError);

      expect(tx.candidateActionLog.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          screeningResultId: 'result-1',
          status: 'running',
        },
        select: { id: true },
      });
      expect(tx.candidateActionLog.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          screeningResultId: 'result-1',
          status: 'running',
          updatedAt: { lt: expect.any(Date) },
        },
        data: {
          status: 'failed',
          errorMessage: STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
        },
      });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.candidateScreeningResult.updateMany).not.toHaveBeenCalled();
      expect(tx.jobDescription.updateMany).not.toHaveBeenCalled();
    },
  );

  it('recovers a stale running external action before applying a final hiring outcome', async () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const updated = mockScreeningResult({ interviewStage: 'onboarded' });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
        .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn().mockResolvedValueOnce(null),
      },
      candidateScreeningResult: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn().mockResolvedValueOnce(updated),
        count: jest.fn().mockResolvedValueOnce(1),
      },
      jobDescription: { updateMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    try {
      await expect(
        updateCandidateInterviewProgress({
          userId: 'u1',
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
          interviewStage: 'onboarded',
          expectedInterviewStage: 'offer',
        }),
      ).resolves.toEqual(expect.objectContaining({ interviewStage: 'onboarded' }));
    } finally {
      jest.useRealTimers();
    }

    expect(tx.candidateActionLog.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        screeningResultId: 'result-1',
        status: 'running',
        updatedAt: {
          lt: new Date(now.getTime() - STALE_CANDIDATE_ACTION_TIMEOUT_MS),
        },
      },
      data: {
        status: 'failed',
        errorMessage: STALE_CANDIDATE_ACTION_ERROR_MESSAGE,
      },
    });
    expect(tx.candidateActionLog.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.candidateScreeningResult.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failed'] as const)(
    'allows a final hiring outcome after an external action is %s',
    async (actionStatus) => {
      const updated = mockScreeningResult({ interviewStage: 'onboarded' });
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'result-1', interviewStage: 'offer' }])
          .mockResolvedValueOnce([{ id: 'jd-1', status: 'published', hiringTarget: 2 }]),
        candidateActionLog: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
          findFirst: jest.fn(({ where }: { where: { status: string } }) =>
            where.status === actionStatus ? { id: 'action-1' } : null,
          ),
        },
        candidateScreeningResult: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          findFirst: jest.fn().mockResolvedValueOnce(updated),
          count: jest.fn().mockResolvedValueOnce(1),
        },
        jobDescription: { updateMany: jest.fn() },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      const result = await updateCandidateInterviewProgress({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        interviewStage: 'onboarded',
        expectedInterviewStage: 'offer',
      });

      expect(result).toEqual(expect.objectContaining({ interviewStage: 'onboarded' }));
      expect(tx.candidateActionLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'running' }) }),
      );
      expect(tx.candidateScreeningResult.updateMany).toHaveBeenCalledTimes(1);
    },
  );

  it('creates action logs with idempotency key', async () => {
    prismaMock.candidateActionLog.upsert.mockResolvedValueOnce({
      id: 'action-1',
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'candidate-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      action: 'chat',
      message: 'Hi',
      status: 'planned',
      idempotencyKey: 'idem-1',
      browserTrace: null,
      errorMessage: null,
      createdAt,
      updatedAt,
    });

    await createCandidateActionLog({
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'candidate-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      action: 'chat',
      message: 'Hi',
      status: 'planned',
      idempotencyKey: 'idem-1',
      browserTrace: null,
    });

    expect(prismaMock.candidateActionLog.upsert).toHaveBeenCalledWith({
      where: {
        userId_idempotencyKey: {
          userId: 'u1',
          idempotencyKey: 'idem-1',
        },
      },
      create: expect.objectContaining({
        userId: 'u1',
        idempotencyKey: 'idem-1',
        screeningResultId: 'result-1',
      }),
      update: {},
    });
  });

  it('updates an action log only from the expected status', async () => {
    prismaMock.candidateActionLog.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateCandidateActionLog({
        userId: 'u1',
        id: 'action-1',
        expectedStatus: 'planned',
        status: 'skipped',
        errorMessage: 'candidate interview stage changed before automatic reply',
      }),
    ).resolves.toBeNull();

    expect(prismaMock.candidateActionLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'action-1', userId: 'u1', status: 'planned' },
      data: {
        status: 'skipped',
        errorMessage: 'candidate interview stage changed before automatic reply',
      },
    });
    expect(prismaMock.candidateActionLog.findFirst).not.toHaveBeenCalled();
  });

  it('returns the updated action log after an expected-status transition succeeds', async () => {
    prismaMock.candidateActionLog.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.candidateActionLog.findFirst.mockResolvedValueOnce({
      id: 'action-1',
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'candidate-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      action: 'chat',
      message: 'Hi',
      status: 'skipped',
      idempotencyKey: 'idem-1',
      browserTrace: null,
      errorMessage: 'candidate interview stage changed before automatic reply',
      createdAt,
      updatedAt,
    });

    const updated = await updateCandidateActionLog({
      userId: 'u1',
      id: 'action-1',
      expectedStatus: 'planned',
      status: 'skipped',
      errorMessage: 'candidate interview stage changed before automatic reply',
    });

    expect(prismaMock.candidateActionLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'action-1', userId: 'u1' },
    });
    expect(updated?.status).toBe('skipped');
  });

  it('claims a planned action log atomically before execution', async () => {
    const claimed = {
      id: 'action-1',
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'candidate-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      action: 'chat',
      message: 'Hi',
      status: 'running',
      idempotencyKey: 'idem-1',
      browserTrace: null,
      errorMessage: null,
      createdAt,
      updatedAt,
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'result-1', interviewStage: 'to_contact', jobDescriptionId: 'jd-1' },
        ])
        .mockResolvedValueOnce([{ status: 'published' }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn().mockResolvedValueOnce(claimed),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await claimCandidateActionLog({
      userId: 'u1',
      id: 'action-1',
      expectedInterviewStage: 'to_contact',
    });

    expect(tx.candidateActionLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'action-1',
        userId: 'u1',
        screeningResultId: 'result-1',
        status: 'planned',
      },
      data: { status: 'running', browserTrace: expect.anything(), errorMessage: null },
    });
    expect(tx.candidateActionLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'action-1', userId: 'u1' },
    });
    expect(result?.status).toBe('running');

    const lockSql = tx.$queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] };
    expect(lockSql.strings?.join(' ')).toContain('candidate_screening_results');
    expect(lockSql.strings?.join(' ')).toContain('FOR UPDATE OF result');
    const jobLockSql = tx.$queryRaw.mock.calls[1]?.[0] as { strings?: readonly string[] };
    expect(jobLockSql.strings?.join(' ')).toContain('job_descriptions');
    expect(jobLockSql.strings?.join(' ')).toContain('FOR UPDATE');
  });

  it.each(['ready_to_publish', 'publishing'] as const)(
    'allows action claims while the JD is %s',
    async (jobDescriptionStatus) => {
      const claimed = {
        id: 'action-1',
        userId: 'u1',
        runId: 'run-1',
        screeningResultId: 'result-1',
        candidateId: 'candidate-1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        mode: 'execution',
        action: 'chat',
        message: 'Hi',
        status: 'running',
        idempotencyKey: 'idem-1',
        browserTrace: null,
        errorMessage: null,
        createdAt,
        updatedAt,
      };
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'result-1', interviewStage: 'to_contact', jobDescriptionId: 'jd-1' },
          ])
          .mockResolvedValueOnce([{ status: jobDescriptionStatus }]),
        candidateActionLog: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          findFirst: jest.fn().mockResolvedValueOnce(claimed),
        },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      await expect(
        claimCandidateActionLog({
          userId: 'u1',
          id: 'action-1',
          expectedInterviewStage: 'to_contact',
        }),
      ).resolves.toMatchObject({ status: 'running' });
      expect(tx.candidateActionLog.updateMany).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['offline', 'filled'] as const)(
    'rejects an action claim when the JD becomes %s after the candidate row is locked',
    async (jobDescriptionStatus) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'result-1', interviewStage: 'to_contact', jobDescriptionId: 'jd-1' },
          ])
          .mockResolvedValueOnce([{ status: jobDescriptionStatus }]),
        candidateActionLog: {
          updateMany: jest.fn(),
          findFirst: jest.fn(),
        },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      await expect(
        claimCandidateActionLog({
          userId: 'u1',
          id: 'action-1',
          expectedInterviewStage: 'to_contact',
        }),
      ).resolves.toBeNull();
      expect(tx.candidateActionLog.updateMany).not.toHaveBeenCalled();
      expect(tx.candidateActionLog.findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects a job-only outreach claim when the JD becomes offline before auto-reply', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ status: 'offline' }]),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      claimJobDescriptionForCandidateOutreach({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toBe(false);
    const jobLockSql = tx.$queryRaw.mock.calls[1]?.[0] as { strings?: readonly string[] };
    expect(jobLockSql.strings?.join(' ')).toContain('job_descriptions');
    expect(jobLockSql.strings?.join(' ')).toContain('FOR UPDATE');
  });

  it.each(['onboarded', 'not_joined', 'rejected', 'withdrawn'] as const)(
    'rejects a candidate outreach claim when terminal stage %s appeared after subject loading',
    async (interviewStage) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ interviewStage }]),
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      await expect(
        claimJobDescriptionForCandidateOutreach({
          userId: 'u1',
          jobDescriptionId: 'jd-1',
          candidateId: 'candidate-1',
        }),
      ).resolves.toBe(false);

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      const candidateLockSql = tx.$queryRaw.mock.calls[0]?.[0] as {
        strings?: readonly string[];
      };
      expect(candidateLockSql.strings?.join(' ')).toContain('candidate_screening_results');
      expect(candidateLockSql.strings?.join(' ')).toContain('candidate_id');
      expect(candidateLockSql.strings?.join(' ')).toContain('FOR UPDATE');
    },
  );

  it('claims candidate outreach only after locking a current non-terminal result and the JD', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ interviewStage: 'to_contact' }])
        .mockResolvedValueOnce([{ status: 'published' }]),
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    await expect(
      claimJobDescriptionForCandidateOutreach({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
      }),
    ).resolves.toBe(true);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns null when a planned action log cannot be claimed', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'result-1', interviewStage: 'to_contact', jobDescriptionId: 'jd-1' },
        ])
        .mockResolvedValueOnce([{ status: 'published' }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: jest.fn(),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await claimCandidateActionLog({
      userId: 'u1',
      id: 'action-1',
      expectedInterviewStage: 'to_contact',
    });

    expect(result).toBeNull();
    expect(tx.candidateActionLog.findFirst).not.toHaveBeenCalled();
  });

  it.each(['onboarded', 'not_joined', 'rejected', 'withdrawn'] as const)(
    'returns null when terminal stage %s wins the race before an action claim',
    async (interviewStage) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'result-1', interviewStage, jobDescriptionId: 'jd-1' }])
          .mockResolvedValueOnce([{ status: 'published' }]),
        candidateActionLog: {
          updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          findFirst: jest.fn().mockResolvedValueOnce({ id: 'action-1', status: 'running' }),
        },
      };
      prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      );

      const result = await claimCandidateActionLog({
        userId: 'u1',
        id: 'action-1',
        expectedInterviewStage: interviewStage,
      });

      expect(result).toBeNull();
      expect(tx.candidateActionLog.updateMany).not.toHaveBeenCalled();
      expect(tx.candidateActionLog.findFirst).not.toHaveBeenCalled();
    },
  );

  it('claims only a failed collect action when resuming post-contact collection', async () => {
    const claimed = {
      id: 'action-collect-1',
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'candidate-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'execution',
      action: 'collect',
      message: null,
      status: 'running',
      idempotencyKey: 'collect-idem-1',
      browserTrace: null,
      errorMessage: null,
      createdAt,
      updatedAt,
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'result-1', interviewStage: 'contacted', jobDescriptionId: 'jd-1' },
        ])
        .mockResolvedValueOnce([{ status: 'published' }]),
      candidateActionLog: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: jest.fn().mockResolvedValueOnce(claimed),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await claimRetryableCollectActionLog({
      userId: 'u1',
      id: 'action-collect-1',
      expectedInterviewStage: 'contacted',
    });

    expect(tx.candidateActionLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'action-collect-1',
        userId: 'u1',
        screeningResultId: 'result-1',
        action: 'collect',
        status: 'failed',
      },
      data: { status: 'running', browserTrace: expect.anything(), errorMessage: null },
    });
    expect(result?.status).toBe('running');
  });

  it('lists JD-scoped results owned by a run or planned by its action logs', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    await listCandidateScreeningResults({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      runId: 'run-2',
      limit: 10,
      offset: 0,
    });

    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        OR: [
          { runId: 'run-2' },
          {
            actionLogs: {
              some: {
                userId: 'u1',
                runId: 'run-2',
              },
            },
          },
        ],
      },
      include: { candidate: true, resume: true },
      orderBy: [{ finalScore: 'desc' }, { rank: 'asc' }],
      skip: 0,
      take: 10,
    });
  });

  it('uses the latest planned chat action run for rescreened candidate detail', async () => {
    prismaMock.candidateScreeningResult.findFirst.mockResolvedValueOnce(
      mockScreeningResult({
        runId: 'run-1',
        candidate: mockCandidate(),
        resume: mockResume(),
        actionLogs: [
          {
            id: 'action-run-3',
            userId: 'u1',
            runId: 'run-3',
            screeningResultId: 'result-1',
            candidateId: 'candidate-1',
            jobDescriptionId: 'jd-1',
            platform: 'boss-like',
            mode: 'dry_run',
            action: 'chat',
            message: 'Already sent',
            status: 'success',
            idempotencyKey: 'run-3:candidate-1:chat',
            browserTrace: null,
            errorMessage: null,
            createdAt: updatedAt,
            updatedAt,
          },
          {
            id: 'action-run-2',
            userId: 'u1',
            runId: 'run-2',
            screeningResultId: 'result-1',
            candidateId: 'candidate-1',
            jobDescriptionId: 'jd-1',
            platform: 'boss-like',
            mode: 'dry_run',
            action: 'chat',
            message: 'Latest planned message',
            status: 'planned',
            idempotencyKey: 'run-2:candidate-1:chat',
            browserTrace: null,
            errorMessage: null,
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: 'action-run-1',
            userId: 'u1',
            runId: 'run-1',
            screeningResultId: 'result-1',
            candidateId: 'candidate-1',
            jobDescriptionId: 'jd-1',
            platform: 'boss-like',
            mode: 'dry_run',
            action: 'chat',
            message: 'Original planned message',
            status: 'planned',
            idempotencyKey: 'run-1:candidate-1:chat',
            browserTrace: null,
            errorMessage: null,
            createdAt: new Date('2026-01-01T03:04:05.000Z'),
            updatedAt: new Date('2026-01-01T03:04:05.000Z'),
          },
        ],
      }),
    );

    const candidate = await getCandidateScreeningDetail({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
    });

    expect(prismaMock.candidateScreeningResult.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
      },
      include: {
        candidate: true,
        resume: true,
        actionLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
    expect(candidate).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        latestPlannedChatRunId: 'run-2',
      }),
    );
  });

  it('filters JD-scoped results by minimum final score', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    await listCandidateScreeningResults({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      minScore: 70,
      limit: 10,
      offset: 0,
    });

    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        finalScore: { gte: 70 },
      },
      include: { candidate: true, resume: true },
      orderBy: [{ finalScore: 'desc' }, { rank: 'asc' }],
      skip: 0,
      take: 10,
    });
  });

  it('filters JD-scoped results by candidate ids for historical evaluation reuse', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    await listCandidateScreeningResults({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateIds: ['candidate-1', 'candidate-2'],
      limit: 2,
    });

    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: { in: ['candidate-1', 'candidate-2'] },
      },
      include: { candidate: true, resume: true },
      orderBy: [{ finalScore: 'desc' }, { rank: 'asc' }],
      skip: 0,
      take: 2,
    });
  });

  it('can restrict current-run planned action results to executable actions', async () => {
    prismaMock.candidateScreeningResult.findMany.mockResolvedValueOnce([]);

    await listCandidateScreeningResults({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      runId: 'run-2',
      plannedActions: ['chat', 'collect'],
      limit: 10,
      offset: 0,
    });

    expect(prismaMock.candidateScreeningResult.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        actionLogs: {
          some: {
            userId: 'u1',
            runId: 'run-2',
            status: 'planned',
            action: { in: ['chat', 'collect'] },
          },
        },
      },
      include: { candidate: true, resume: true },
      orderBy: [{ finalScore: 'desc' }, { rank: 'asc' }],
      skip: 0,
      take: 10,
    });
  });
});
