/**
 * @jest-environment node
 */
import {
  GET as listScreeningRuns,
  POST as createScreeningRun,
} from '@/app/api/jd/[id]/candidate-screening/runs/route';
import { GET as getScreeningRun } from '@/app/api/candidate-screening/runs/[runId]/route';
import { GET as streamScreeningRun } from '@/app/api/candidate-screening/runs/[runId]/stream/route';
import { POST as executeScreeningRunActionsRoute } from '@/app/api/candidate-screening/runs/[runId]/execute-actions/route';
import { GET as getCandidateTracking } from '@/app/api/candidate-screening/tracking/route';
import { POST as evaluateCandidateDecisionRoute } from '@/app/api/decision/evaluate/route';
import { GET as listJdCandidates } from '@/app/api/jd/[id]/candidates/route';
import {
  GET as getJdCandidate,
  PATCH as updateJdCandidate,
} from '@/app/api/jd/[id]/candidates/[candidateId]/route';
import {
  GET as listCandidateInterviewFeedbacksRoute,
  POST as upsertCandidateInterviewFeedbackRoute,
} from '@/app/api/jd/[id]/candidates/[candidateId]/interview-feedbacks/route';
import { GET as openOriginalProfile } from '@/app/api/jd/[id]/candidates/[candidateId]/original-profile/route';
import { GET as listResumeLibraryRoute } from '@/app/api/resumes/route';
import { GET as listInterviewRecordsRoute } from '@/app/api/interviews/route';
import type {
  CandidateDto,
  CandidateInterviewFeedbackDto,
  CandidateDecisionResultDto,
  CandidateResumeDto,
  CandidateScreeningDetailDto,
  CandidateScreeningResultDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunEventDto,
  CandidateScreeningRunDto,
  CandidateTrackingOverviewDto,
} from '@/lib/candidate-screening/repo';
import type { JD, JobDescriptionDto } from '@/types';

const requireAuthMock = jest.fn();
const getJobDescriptionByIdMock = jest.fn();
const createAndStartCandidateScreeningRunMock = jest.fn();
const listCandidateScreeningRunsMock = jest.fn();
const getCandidateScreeningRunMock = jest.fn();
const listCandidateScreeningRunEventsMock = jest.fn();
const listCandidateScreeningResultsMock = jest.fn();
const getCandidateTrackingOverviewMock = jest.fn();
const getCandidateScreeningDetailMock = jest.fn();
const updateCandidateInterviewProgressMock = jest.fn();
const listCandidateInterviewFeedbacksMock = jest.fn();
const upsertCandidateInterviewFeedbackMock = jest.fn();
const evaluateCandidateHiringDecisionMock = jest.fn();
const executeScreeningRunActionsMock = jest.fn();
const listCandidateResumeLibraryMock = jest.fn();
const listCandidateInterviewRecordsMock = jest.fn();
const resolveRecruitmentPlatformRuntimeConfigMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      headers: new Headers(),
      json: async () => body,
    }),
    redirect: (url: string | URL, init?: number | { status?: number }) => ({
      status: typeof init === 'number' ? init : (init?.status ?? 307),
      headers: new Headers({ location: String(url) }),
      json: async () => ({}),
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

jest.mock('@/lib/jd/job-description-repo', () => ({
  getJobDescriptionById: (...args: unknown[]) => getJobDescriptionByIdMock(...args),
}));

jest.mock('@/lib/candidate-screening/service', () => ({
  createAndStartCandidateScreeningRun: (...args: unknown[]) =>
    createAndStartCandidateScreeningRunMock(...args),
}));

jest.mock('@/lib/candidate-screening/repo', () => ({
  listCandidateScreeningRuns: (...args: unknown[]) => listCandidateScreeningRunsMock(...args),
  getCandidateScreeningRun: (...args: unknown[]) => getCandidateScreeningRunMock(...args),
  listCandidateScreeningRunEvents: (...args: unknown[]) =>
    listCandidateScreeningRunEventsMock(...args),
  listCandidateScreeningResults: (...args: unknown[]) => listCandidateScreeningResultsMock(...args),
  getCandidateTrackingOverview: (...args: unknown[]) => getCandidateTrackingOverviewMock(...args),
  getCandidateScreeningDetail: (...args: unknown[]) => getCandidateScreeningDetailMock(...args),
  updateCandidateInterviewProgress: (...args: unknown[]) =>
    updateCandidateInterviewProgressMock(...args),
  listCandidateInterviewFeedbacks: (...args: unknown[]) =>
    listCandidateInterviewFeedbacksMock(...args),
  upsertCandidateInterviewFeedback: (...args: unknown[]) =>
    upsertCandidateInterviewFeedbackMock(...args),
  listCandidateResumeLibrary: (...args: unknown[]) => listCandidateResumeLibraryMock(...args),
  listCandidateInterviewRecords: (...args: unknown[]) => listCandidateInterviewRecordsMock(...args),
}));

jest.mock('@/lib/candidate-screening/hiring-decision', () => ({
  evaluateCandidateHiringDecision: (...args: unknown[]) =>
    evaluateCandidateHiringDecisionMock(...args),
}));

jest.mock('@/lib/candidate-screening/runner', () => ({
  executeScreeningRunActions: (...args: unknown[]) => executeScreeningRunActionsMock(...args),
}));

jest.mock('@/lib/recruitment-platform-config', () => ({
  resolveRecruitmentPlatformRuntimeConfig: (...args: unknown[]) =>
    resolveRecruitmentPlatformRuntimeConfigMock(...args),
}));

const now = '2026-06-29T00:00:00.000Z';

const sampleJdContent: JD = {
  title: 'Frontend Engineer',
  summary: 'Build product UI',
  responsibilities: ['Ship user-facing features'],
  requirements: ['TypeScript'],
  bonus: [],
  highlights: ['Strong product context'],
};

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: 'Engineering',
  position: 'Frontend Engineer',
  positionDescription: 'Build product UI',
  tone: 'tech',
  status: 'published',
  content: sampleJdContent,
  evaluation: null,
  generationMeta: null,
  createdAt: now,
  updatedAt: now,
};

const sampleRun: CandidateScreeningRunDto = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  platform: 'boss-like',
  mode: 'dry_run',
  status: 'running',
  currentStage: 'evaluating',
  skillId: 'screen-candidates-v2',
  workflow: { name: 'screen_candidates', version: 2 },
  currentWorkflowStep: 'chat_candidate',
  searchPlan: null,
  evaluationSchema: null,
  stats: {
    fetched: 8,
    deduped: 1,
    stored: 7,
    vectorRecalled: 3,
    evaluated: 5,
    recommendedChat: 2,
    recommendedCollect: 1,
    skipped: 2,
    failed: 0,
  },
  errorMessage: null,
  startedAt: now,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
};

const sampleCandidate: CandidateDto = {
  id: 'cand-1',
  userId: 'u1',
  displayName: 'Ada Lovelace',
  currentTitle: 'Senior Frontend Engineer',
  currentCompany: 'Analytical Engines',
  location: 'Remote',
  experienceYears: 8,
  sourcePlatform: 'boss-like',
  platformCandidateId: 'boss-cand-1',
  profileUrl: 'https://example.test/candidates/1',
  identityKey: 'Ada Lovelace|Analytical Engines',
  identityHash: 'hash-1',
  lastActiveAt: now,
  contacted: false,
  replied: false,
  lastContactAt: null,
  createdAt: now,
  updatedAt: now,
};

const sampleResume: CandidateResumeDto = {
  id: 'resume-1',
  userId: 'u1',
  candidateId: 'cand-1',
  sourcePlatform: 'boss-like',
  profileUrl: 'https://example.test/candidates/1',
  rawText: 'TypeScript, React, product engineering',
  structuredSummary: { skills: ['TypeScript', 'React'] },
  resumeHash: 'resume-hash-1',
  fetchedAt: now,
  createdAt: now,
};

const sampleResult: CandidateScreeningResultDto = {
  id: 'result-1',
  userId: 'u1',
  runId: 'run-1',
  jobDescriptionId: 'jd-1',
  candidateId: 'cand-1',
  resumeId: 'resume-1',
  source: 'both',
  tags: {
    skills: ['TypeScript'],
    domainKnowledge: ['SaaS'],
    generalAbility: ['ownership'],
    risk: [],
    activity: ['active'],
    custom: [],
  },
  scoreDetail: {
    skill: 90,
    domain: 80,
    ability: 88,
    risk: 95,
    llmBonus: 3,
    total: 89,
  },
  finalScore: 89,
  rank: 1,
  decisionAction: 'chat',
  decisionPriority: 'high',
  decisionReason: 'Strong TypeScript and product experience',
  actionPlan: {
    action: 'chat',
    priority: 'high',
    message: 'Invite to discuss frontend platform work.',
    reason: 'High score',
  },
  actionStatus: 'planned',
  interviewStage: 'to_contact',
  notes: null,
  createdAt: now,
  updatedAt: now,
};

const sampleCandidateListItem: CandidateScreeningResultListItem = {
  ...sampleResult,
  candidate: sampleCandidate,
  resume: sampleResume,
};

const sampleTrackingOverview: CandidateTrackingOverviewDto = {
  jobs: [
    {
      jobDescription: {
        id: 'jd-1',
        department: 'Engineering',
        position: 'Frontend Engineer',
        status: 'published',
        title: 'Frontend Engineer',
        updatedAt: now,
      },
      totalCandidates: 1,
      activeCandidates: 1,
      interviewingCandidates: 0,
      skippedCandidates: 0,
      latestCandidateUpdatedAt: now,
    },
  ],
  candidates: [
    {
      ...sampleCandidateListItem,
      jobDescription: {
        id: 'jd-1',
        department: 'Engineering',
        position: 'Frontend Engineer',
        status: 'published',
        title: 'Frontend Engineer',
        updatedAt: now,
      },
    },
  ],
};

const sampleCandidateDetail: CandidateScreeningDetailDto = {
  ...sampleCandidateListItem,
  actionLogs: [
    {
      id: 'action-log-1',
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'cand-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      action: 'chat',
      message: 'Invite to discuss frontend platform work.',
      status: 'planned',
      idempotencyKey: 'run-1:cand-1:chat',
      browserTrace: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const sampleFeedback: CandidateInterviewFeedbackDto = {
  id: 'feedback-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  candidateId: 'cand-1',
  stage: 'first_interview',
  interviewer: 'Grace Hopper',
  rating: 4,
  dimensionRatings: [
    { dimension: 'core_competency', score: 4, evidence: '能够独立完成核心开发任务' },
  ],
  pros: ['TypeScript 扎实', '产品判断好'],
  cons: ['系统设计需要追问'],
  decision: 'pass',
  notes: '建议推进二面',
  createdAt: now,
  updatedAt: now,
};

const sampleDecisionResult: CandidateDecisionResultDto = {
  decisionScope: 'preliminary',
  missingFeedbackStages: ['phone_screen', 'second_interview', 'final_interview'],
  hireDecision: 'yes',
  confidence: 0.82,
  offerAcceptProbability: 0.68,
  generatedAt: now,
  features: {
    skillMatchScore: 0.86,
    experienceMatch: 0.9,
    interviewScore: 0.8,
    intentLevel: 'high',
    risks: {
      salarySensitive: true,
      hasOtherOffers: false,
      lowStability: false,
    },
    responsiveness: 0.85,
  },
  dimensionAssessments: [
    {
      key: 'core_competency',
      label: '核心任务胜任力',
      score: 0.86,
      weight: 0.35,
      contribution: 0.3,
      confidence: 0.8,
      status: 'strong',
      summary: '综合简历与面试证据评估',
      evidence: ['TypeScript 扎实'],
    },
  ],
  decisionTrace: {
    weightedScore: 0.82,
    hardRejected: false,
    formula: [
      {
        key: 'core_competency',
        label: '核心任务胜任力',
        score: 0.86,
        weight: 0.35,
        contribution: 0.3,
      },
    ],
    thresholds: {
      strongYes: 0.82,
      strongYesDimensionFloor: 0.6,
      yes: 0.65,
      preliminaryYes: 0.6,
      hardRejectCoreCompetency: 0.4,
    },
    feedbackCoverage: { completed: 1, total: 4 },
  },
  riskAnalysis: {
    level: 'medium',
    reasons: ['薪资敏感'],
  },
  strengths: ['TypeScript 扎实'],
  weaknesses: ['系统设计需要追问'],
  suggestions: [{ type: 'action', content: '先确认薪资预期再发 offer' }],
};

const sampleRunEvent: CandidateScreeningRunEventDto = {
  id: 'event-1',
  userId: 'u1',
  runId: 'run-1',
  jobDescriptionId: 'jd-1',
  candidateId: null,
  stage: 'planning',
  level: 'success',
  message: '生成搜索计划',
  detail: { retrievalQuery: 'frontend react' },
  createdAt: now,
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(url: string, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
}

function params<T extends Record<string, string>>(value: T): Promise<T> {
  return Promise.resolve(value);
}

describe('candidate screening API routes', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getJobDescriptionByIdMock.mockReset();
    createAndStartCandidateScreeningRunMock.mockReset();
    listCandidateScreeningRunsMock.mockReset();
    getCandidateScreeningRunMock.mockReset();
    listCandidateScreeningRunEventsMock.mockReset();
    listCandidateScreeningResultsMock.mockReset();
    getCandidateTrackingOverviewMock.mockReset();
    getCandidateScreeningDetailMock.mockReset();
    updateCandidateInterviewProgressMock.mockReset();
    listCandidateInterviewFeedbacksMock.mockReset();
    upsertCandidateInterviewFeedbackMock.mockReset();
    evaluateCandidateHiringDecisionMock.mockReset();
    executeScreeningRunActionsMock.mockReset();
    listCandidateResumeLibraryMock.mockReset();
    listCandidateInterviewRecordsMock.mockReset();
    resolveRecruitmentPlatformRuntimeConfigMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    listCandidateScreeningRunEventsMock.mockResolvedValue([]);
    resolveRecruitmentPlatformRuntimeConfigMock.mockResolvedValue({
      platform: 'boss-like',
      baseUrl: 'https://boss-like.test',
      username: '',
      password: '',
      variables: {},
      siteFingerprint: 'site-1',
      siteTemplatePlatform: 'boss-like',
    });
  });

  it('creates a screening run for an owned published JD', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(sampleJobDescription);
    createAndStartCandidateScreeningRunMock.mockResolvedValueOnce(sampleRun);
    const request = jsonRequest('http://localhost/api/jd/jd-1/candidate-screening/runs', {
      platform: 'boss-like',
      maxCandidates: 5,
      batchSize: 2,
    });

    const response = await createScreeningRun(request, {
      params: params({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.run.id).toBe('run-1');
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-1');
    expect(createAndStartCandidateScreeningRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescription: sampleJobDescription,
      request: {
        platform: 'boss-like',
        mode: 'dry_run',
        maxCandidates: 5,
        batchSize: 2,
        allowAlreadyContacted: false,
      },
    });
  });

  it('returns 400 when create run receives malformed JSON', async () => {
    const request = malformedJsonRequest('http://localhost/api/jd/jd-1/candidate-screening/runs');

    const response = await createScreeningRun(request, {
      params: params({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid JSON body');
    expect(getJobDescriptionByIdMock).not.toHaveBeenCalled();
    expect(createAndStartCandidateScreeningRunMock).not.toHaveBeenCalled();
  });

  it('rejects screening when JD does not exist', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(null);
    const request = jsonRequest('http://localhost/api/jd/jd-missing/candidate-screening/runs', {
      platform: 'boss-like',
    });

    const response = await createScreeningRun(request, {
      params: params({ id: 'jd-missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('job description not found');
    expect(createAndStartCandidateScreeningRunMock).not.toHaveBeenCalled();
  });

  it('rejects screening when JD status is not eligible', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({
      ...sampleJobDescription,
      status: 'created',
    });
    const request = jsonRequest('http://localhost/api/jd/jd-1/candidate-screening/runs', {
      platform: 'boss-like',
    });

    const response = await createScreeningRun(request, {
      params: params({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('job description is not eligible for screening');
    expect(createAndStartCandidateScreeningRunMock).not.toHaveBeenCalled();
  });

  it('lists runs scoped to the current user and JD', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(sampleJobDescription);
    listCandidateScreeningRunsMock.mockResolvedValueOnce([sampleRun]);

    const response = await listScreeningRuns({} as Request, {
      params: params({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runs).toEqual([sampleRun]);
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-1');
    expect(listCandidateScreeningRunsMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
    });
  });

  it('returns 404 when listing runs for a missing scoped JD', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(null);

    const response = await listScreeningRuns({} as Request, {
      params: params({ id: 'jd-missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('job description not found');
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-missing');
    expect(listCandidateScreeningRunsMock).not.toHaveBeenCalled();
  });

  it('returns run progress by run id', async () => {
    getCandidateScreeningRunMock.mockResolvedValueOnce(sampleRun);
    listCandidateScreeningRunEventsMock.mockResolvedValueOnce([sampleRunEvent]);

    const response = await getScreeningRun({} as Request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run).toEqual(sampleRun);
    expect(body.run).toMatchObject({
      skillId: 'screen-candidates-v2',
      workflow: { name: 'screen_candidates', version: 2 },
      currentWorkflowStep: 'chat_candidate',
    });
    expect(body.events).toEqual([sampleRunEvent]);
    expect(getCandidateScreeningRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
    });
    expect(listCandidateScreeningRunEventsMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
      limit: 300,
    });
  });

  it('streams run progress as SSE for a scoped terminal run', async () => {
    const terminalRun: CandidateScreeningRunDto = { ...sampleRun, status: 'success' };
    getCandidateScreeningRunMock.mockResolvedValue(terminalRun);
    listCandidateScreeningRunEventsMock.mockResolvedValueOnce([sampleRunEvent]);

    const response = await streamScreeningRun({} as Request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain(
      `data: ${JSON.stringify({ run: terminalRun, events: [sampleRunEvent] })}`,
    );
    expect(getCandidateScreeningRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
    });
    expect(listCandidateScreeningRunEventsMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
      limit: 300,
    });
  });

  it('requires confirmExecution for execute-actions', async () => {
    const request = jsonRequest(
      'http://localhost/api/candidate-screening/runs/run-1/execute-actions',
      { confirmExecution: false },
    );

    const response = await executeScreeningRunActionsRoute(request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('confirmExecution must be true');
    expect(getCandidateScreeningRunMock).not.toHaveBeenCalled();
    expect(executeScreeningRunActionsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when execute-actions receives malformed JSON', async () => {
    const request = malformedJsonRequest(
      'http://localhost/api/candidate-screening/runs/run-1/execute-actions',
    );

    const response = await executeScreeningRunActionsRoute(request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid JSON body');
    expect(getCandidateScreeningRunMock).not.toHaveBeenCalled();
    expect(executeScreeningRunActionsMock).not.toHaveBeenCalled();
  });

  it('executes confirmed actions for a scoped run', async () => {
    getCandidateScreeningRunMock.mockResolvedValueOnce(sampleRun);
    executeScreeningRunActionsMock.mockResolvedValueOnce(undefined);
    const request = jsonRequest(
      'http://localhost/api/candidate-screening/runs/run-1/execute-actions',
      { confirmExecution: true, maxChatActions: 1, maxCollectActions: 2 },
    );

    const response = await executeScreeningRunActionsRoute(request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(getCandidateScreeningRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
    });
    expect(executeScreeningRunActionsMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
      request: {
        confirmExecution: true,
        maxChatActions: 1,
        maxCollectActions: 2,
      },
    });
  });

  it('lists JD candidates with filters', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(sampleJobDescription);
    listCandidateScreeningResultsMock.mockResolvedValueOnce([sampleCandidateListItem]);

    const response = await listJdCandidates(
      {
        url: 'http://localhost/api/jd/jd-1/candidates?interviewStage=to_contact&limit=25&offset=5&minScore=70&runId=run-1',
      } as Request,
      { params: params({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toEqual([sampleCandidateListItem]);
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-1');
    expect(listCandidateScreeningResultsMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      limit: 25,
      offset: 5,
      interviewStage: 'to_contact',
      minScore: 70,
      runId: 'run-1',
    });
  });

  it('rejects invalid candidate minScore filters', async () => {
    const response = await listJdCandidates(
      {
        url: 'http://localhost/api/jd/jd-1/candidates?minScore=overqualified',
      } as Request,
      { params: params({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('minScore is invalid');
    expect(getJobDescriptionByIdMock).not.toHaveBeenCalled();
    expect(listCandidateScreeningResultsMock).not.toHaveBeenCalled();
  });

  it('returns cross-JD candidate tracking overview for the current user', async () => {
    getCandidateTrackingOverviewMock.mockResolvedValueOnce(sampleTrackingOverview);

    const response = await getCandidateTracking({
      url: 'http://localhost/api/candidate-screening/tracking?limit=80',
    } as Request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(sampleTrackingOverview);
    expect(getCandidateTrackingOverviewMock).toHaveBeenCalledWith({
      userId: 'u1',
      limit: 80,
    });
  });

  it('lists resume library records for the current user', async () => {
    listCandidateResumeLibraryMock.mockResolvedValueOnce([
      {
        resume: sampleResume,
        candidate: sampleCandidate,
        mountedJobs: [
          {
            screeningResultId: 'result-1',
            candidateId: 'cand-1',
            resumeId: 'resume-1',
            finalScore: 89,
            interviewStage: 'to_contact',
            decisionAction: 'chat',
            updatedAt: now,
            jobDescription: {
              id: 'jd-1',
              department: 'Engineering',
              position: 'Frontend Engineer',
              status: 'published',
              title: 'Frontend Engineer',
              updatedAt: now,
            },
          },
        ],
      },
    ]);

    const response = await listResumeLibraryRoute(
      new Request('http://localhost/api/resumes?limit=9999'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumes).toHaveLength(1);
    expect(listCandidateResumeLibraryMock).toHaveBeenCalledWith({ userId: 'u1', limit: 500 });
  });

  it('uses the default limit for an empty resume library limit', async () => {
    listCandidateResumeLibraryMock.mockResolvedValueOnce([]);

    const response = await listResumeLibraryRoute(
      new Request('http://localhost/api/resumes?limit='),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumes).toEqual([]);
    expect(listCandidateResumeLibraryMock).toHaveBeenCalledWith({ userId: 'u1', limit: 200 });
  });

  it('uses the default limit for a whitespace resume library limit', async () => {
    listCandidateResumeLibraryMock.mockResolvedValueOnce([]);

    const response = await listResumeLibraryRoute(
      new Request('http://localhost/api/resumes?limit=%20%20'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumes).toEqual([]);
    expect(listCandidateResumeLibraryMock).toHaveBeenCalledWith({ userId: 'u1', limit: 200 });
  });

  it('lists interview records for the current user', async () => {
    listCandidateInterviewRecordsMock.mockResolvedValueOnce([
      {
        ...sampleFeedback,
        candidate: sampleCandidate,
        jobDescription: {
          id: 'jd-1',
          department: 'Engineering',
          position: 'Frontend Engineer',
          status: 'published',
          title: 'Frontend Engineer',
          updatedAt: now,
        },
      },
    ]);

    const response = await listInterviewRecordsRoute(
      new Request('http://localhost/api/interviews?limit=abc'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.interviews).toHaveLength(1);
    expect(listCandidateInterviewRecordsMock).toHaveBeenCalledWith({ userId: 'u1', limit: 200 });
  });

  it('uses the default limit for an empty interview records limit', async () => {
    listCandidateInterviewRecordsMock.mockResolvedValueOnce([]);

    const response = await listInterviewRecordsRoute(
      new Request('http://localhost/api/interviews?limit='),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.interviews).toEqual([]);
    expect(listCandidateInterviewRecordsMock).toHaveBeenCalledWith({ userId: 'u1', limit: 200 });
  });

  it('uses the default limit for a whitespace interview records limit', async () => {
    listCandidateInterviewRecordsMock.mockResolvedValueOnce([]);

    const response = await listInterviewRecordsRoute(
      new Request('http://localhost/api/interviews?limit=%20%20'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.interviews).toEqual([]);
    expect(listCandidateInterviewRecordsMock).toHaveBeenCalledWith({ userId: 'u1', limit: 200 });
  });

  it('returns 404 when listing candidates for a missing scoped JD', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(null);

    const response = await listJdCandidates(
      {
        url: 'http://localhost/api/jd/jd-missing/candidates?limit=25',
      } as Request,
      { params: params({ id: 'jd-missing' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('job description not found');
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-missing');
    expect(listCandidateScreeningResultsMock).not.toHaveBeenCalled();
  });

  it('returns JD candidate detail', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);

    const response = await getJdCandidate({} as Request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidate).toEqual(sampleCandidateDetail);
    expect(getCandidateScreeningDetailMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
  });

  it('lists structured interview feedback for a scoped candidate', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([sampleFeedback]);

    const response = await listCandidateInterviewFeedbacksRoute({} as Request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feedbacks).toEqual([sampleFeedback]);
    expect(getCandidateScreeningDetailMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
    expect(listCandidateInterviewFeedbacksMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
  });

  it('upserts structured interview feedback with trimmed arrays', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'interviewing',
    });
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([
      { ...sampleFeedback, id: 'feedback-phone', stage: 'phone_screen' },
    ]);
    upsertCandidateInterviewFeedbackMock.mockResolvedValueOnce(sampleFeedback);
    const request = jsonRequest(
      'http://localhost/api/jd/jd-1/candidates/cand-1/interview-feedbacks',
      {
        stage: 'first_interview',
        interviewer: '  Grace Hopper  ',
        rating: 4,
        dimensionRatings: [
          {
            dimension: 'core_competency',
            score: 4,
            evidence: ' 能够独立完成核心开发任务 ',
          },
        ],
        pros: [' TypeScript 扎实 ', '', '产品判断好'],
        cons: [' 系统设计需要追问 '],
        decision: 'pass',
        notes: '  建议推进二面  ',
      },
    );

    const response = await upsertCandidateInterviewFeedbackRoute(request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feedback).toEqual(sampleFeedback);
    expect(getCandidateScreeningDetailMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
    expect(listCandidateInterviewFeedbacksMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
    expect(upsertCandidateInterviewFeedbackMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
      stage: 'first_interview',
      interviewer: 'Grace Hopper',
      rating: 4,
      dimensionRatings: [
        {
          dimension: 'core_competency',
          score: 4,
          evidence: '能够独立完成核心开发任务',
        },
      ],
      pros: ['TypeScript 扎实', '产品判断好'],
      cons: ['系统设计需要追问'],
      decision: 'pass',
      notes: '建议推进二面',
    });
  });

  it('rejects feedback that skips the candidate interview stage', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([]);
    const request = jsonRequest(
      'http://localhost/api/jd/jd-1/candidates/cand-1/interview-feedbacks',
      {
        stage: 'final_interview',
        interviewer: 'Grace Hopper',
        rating: 4,
        dimensionRatings: [
          {
            dimension: 'core_competency',
            score: 4,
            evidence: '能够独立完成核心开发任务',
          },
        ],
        pros: [],
        cons: [],
        decision: 'pass',
      },
    );

    const response = await upsertCandidateInterviewFeedbackRoute(request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('不能新增终面评价');
    expect(upsertCandidateInterviewFeedbackMock).not.toHaveBeenCalled();
  });

  it('returns 404 when interview feedback candidate is missing', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce(null);

    const response = await listCandidateInterviewFeedbacksRoute({} as Request, {
      params: params({ id: 'jd-1', candidateId: 'cand-missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('candidate screening result not found');
    expect(listCandidateInterviewFeedbacksMock).not.toHaveBeenCalled();
  });

  it('rejects invalid interview feedback rating', async () => {
    const request = jsonRequest(
      'http://localhost/api/jd/jd-1/candidates/cand-1/interview-feedbacks',
      {
        stage: 'first_interview',
        interviewer: 'Grace Hopper',
        rating: 6,
        pros: [],
        cons: [],
        decision: 'pass',
      },
    );

    const response = await upsertCandidateInterviewFeedbackRoute(request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('rating must be between 1 and 5');
    expect(upsertCandidateInterviewFeedbackMock).not.toHaveBeenCalled();
  });

  it('rejects a dimension score without concrete evidence', async () => {
    const request = jsonRequest(
      'http://localhost/api/jd/jd-1/candidates/cand-1/interview-feedbacks',
      {
        stage: 'first_interview',
        interviewer: 'Grace Hopper',
        rating: 4,
        dimensionRatings: [{ dimension: 'core_competency', score: 4, evidence: '   ' }],
        pros: [],
        cons: [],
        decision: 'pass',
      },
    );

    const response = await upsertCandidateInterviewFeedbackRoute(request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('dimension rating evidence is required');
    expect(upsertCandidateInterviewFeedbackMock).not.toHaveBeenCalled();
  });

  it('evaluates the hiring decision from JD, candidate, and interview feedback', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(sampleJobDescription);
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([sampleFeedback]);
    evaluateCandidateHiringDecisionMock.mockReturnValueOnce(sampleDecisionResult);
    const request = jsonRequest('http://localhost/api/decision/evaluate', {
      job_description_id: 'jd-1',
      candidate_id: 'cand-1',
    });

    const response = await evaluateCandidateDecisionRoute(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toEqual(sampleDecisionResult);
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-1');
    expect(getCandidateScreeningDetailMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
    expect(listCandidateInterviewFeedbacksMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
    expect(evaluateCandidateHiringDecisionMock).toHaveBeenCalledWith({
      jobDescription: sampleJobDescription,
      candidate: sampleCandidateDetail,
      interviewFeedbacks: [sampleFeedback],
    });
  });

  it('rejects a hiring decision without interview evidence', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce(sampleJobDescription);
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([]);

    const response = await evaluateCandidateDecisionRoute(
      jsonRequest('http://localhost/api/decision/evaluate', {
        job_description_id: 'jd-1',
        candidate_id: 'cand-1',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('至少完成一轮结构化评价后才能生成建议');
    expect(evaluateCandidateHiringDecisionMock).not.toHaveBeenCalled();
  });

  it('redirects to the original recruiting site profile for a scoped candidate', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      candidate: {
        ...sampleCandidate,
        profileUrl: '/employer/resumes/cand-1',
      },
      resume: {
        ...sampleResume,
        profileUrl: '/employer/resumes/cand-1',
      },
    });

    const response = await openOriginalProfile({} as Request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://boss-like.test/employer/resumes/cand-1');
    expect(getCandidateScreeningDetailMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
    });
    expect(resolveRecruitmentPlatformRuntimeConfigMock).toHaveBeenCalledWith({
      userId: 'u1',
      platform: 'boss-like',
    });
  });

  it('updates interview progress and notes', async () => {
    const updatedResult: CandidateScreeningResultDto = {
      ...sampleResult,
      interviewStage: 'contacted',
      notes: 'Invitation sent',
    };
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([]);
    updateCandidateInterviewProgressMock.mockResolvedValueOnce(updatedResult);
    const request = new Request('http://localhost/api/jd/jd-1/candidates/cand-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interviewStage: 'contacted',
        notes: '  Invitation sent  ',
      }),
    });

    const response = await updateJdCandidate(request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidate).toEqual(updatedResult);
    expect(updateCandidateInterviewProgressMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      candidateId: 'cand-1',
      interviewStage: 'contacted',
      notes: 'Invitation sent',
    });
  });

  it('rejects an invalid interview stage jump', async () => {
    getCandidateScreeningDetailMock.mockResolvedValueOnce(sampleCandidateDetail);
    listCandidateInterviewFeedbacksMock.mockResolvedValueOnce([]);

    const response = await updateJdCandidate(
      jsonRequest('http://localhost/api/jd/jd-1/candidates/cand-1', {
        interviewStage: 'phone_screen',
      }),
      { params: params({ id: 'jd-1', candidateId: 'cand-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('不能从“待联系”直接推进到“电话沟通”');
    expect(updateCandidateInterviewProgressMock).not.toHaveBeenCalled();
  });

  it('returns 400 when update candidate progress receives malformed JSON', async () => {
    const request = malformedJsonRequest('http://localhost/api/jd/jd-1/candidates/cand-1', 'PATCH');

    const response = await updateJdCandidate(request, {
      params: params({ id: 'jd-1', candidateId: 'cand-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid JSON body');
    expect(updateCandidateInterviewProgressMock).not.toHaveBeenCalled();
  });

  it('rejects invalid interview stage', async () => {
    const response = await listJdCandidates(
      {
        url: 'http://localhost/api/jd/jd-1/candidates?interviewStage=unknown',
      } as Request,
      { params: params({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('interviewStage is invalid');
    expect(listCandidateScreeningResultsMock).not.toHaveBeenCalled();
  });
});
