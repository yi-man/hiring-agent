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
import { GET as listJdCandidates } from '@/app/api/jd/[id]/candidates/route';
import {
  GET as getJdCandidate,
  PATCH as updateJdCandidate,
} from '@/app/api/jd/[id]/candidates/[candidateId]/route';
import { GET as openOriginalProfile } from '@/app/api/jd/[id]/candidates/[candidateId]/original-profile/route';
import type {
  CandidateDto,
  CandidateResumeDto,
  CandidateScreeningDetailDto,
  CandidateScreeningResultDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunDto,
} from '@/lib/candidate-screening/repo';
import type { JD, JobDescriptionDto } from '@/types';

const requireAuthMock = jest.fn();
const getJobDescriptionByIdMock = jest.fn();
const createAndStartCandidateScreeningRunMock = jest.fn();
const listCandidateScreeningRunsMock = jest.fn();
const getCandidateScreeningRunMock = jest.fn();
const listCandidateScreeningResultsMock = jest.fn();
const getCandidateScreeningDetailMock = jest.fn();
const updateCandidateInterviewProgressMock = jest.fn();
const executeScreeningRunActionsMock = jest.fn();

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
  listCandidateScreeningResults: (...args: unknown[]) => listCandidateScreeningResultsMock(...args),
  getCandidateScreeningDetail: (...args: unknown[]) => getCandidateScreeningDetailMock(...args),
  updateCandidateInterviewProgress: (...args: unknown[]) =>
    updateCandidateInterviewProgressMock(...args),
}));

jest.mock('@/lib/candidate-screening/runner', () => ({
  executeScreeningRunActions: (...args: unknown[]) => executeScreeningRunActionsMock(...args),
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
    listCandidateScreeningResultsMock.mockReset();
    getCandidateScreeningDetailMock.mockReset();
    updateCandidateInterviewProgressMock.mockReset();
    executeScreeningRunActionsMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
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
      limit: 10,
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

    const response = await getScreeningRun({} as Request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run).toEqual(sampleRun);
    expect(getCandidateScreeningRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
    });
  });

  it('streams run progress as SSE for a scoped terminal run', async () => {
    const terminalRun: CandidateScreeningRunDto = { ...sampleRun, status: 'success' };
    getCandidateScreeningRunMock.mockResolvedValue(terminalRun);

    const response = await streamScreeningRun({} as Request, {
      params: params({ runId: 'run-1' }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain(`data: ${JSON.stringify({ run: terminalRun })}`);
    expect(getCandidateScreeningRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'run-1',
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
        url: 'http://localhost/api/jd/jd-1/candidates?interviewStage=to_contact&limit=25&offset=5',
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
    });
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

  it('redirects to the original recruiting site profile for a scoped candidate', async () => {
    const originalBaseUrl = process.env.BOSS_LIKE_BASE_URL;
    process.env.BOSS_LIKE_BASE_URL = 'https://boss-like.test';
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

    try {
      const response = await openOriginalProfile({} as Request, {
        params: params({ id: 'jd-1', candidateId: 'cand-1' }),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(
        'https://boss-like.test/employer/resumes/cand-1',
      );
      expect(getCandidateScreeningDetailMock).toHaveBeenCalledWith({
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        candidateId: 'cand-1',
      });
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env.BOSS_LIKE_BASE_URL;
      } else {
        process.env.BOSS_LIKE_BASE_URL = originalBaseUrl;
      }
    }
  });

  it('updates interview progress and notes', async () => {
    const updatedResult: CandidateScreeningResultDto = {
      ...sampleResult,
      interviewStage: 'phone_screen',
      notes: 'Schedule phone screen',
    };
    updateCandidateInterviewProgressMock.mockResolvedValueOnce(updatedResult);
    const request = new Request('http://localhost/api/jd/jd-1/candidates/cand-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interviewStage: 'phone_screen',
        notes: '  Schedule phone screen  ',
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
      interviewStage: 'phone_screen',
      notes: 'Schedule phone screen',
    });
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
