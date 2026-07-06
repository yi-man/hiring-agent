/**
 * @jest-environment node
 */
import { GET as listJds, POST as createJd } from '@/app/api/jd/route';
import { GET as getJd, PATCH as patchJd } from '@/app/api/jd/[id]/route';
import { POST as regenerateJd } from '@/app/api/jd/[id]/regenerate/route';
import { runJDAgent } from '@/lib/jd-agent/service';
import type { JD } from '@/types';

const requireAuthMock = jest.fn();
const listJobDescriptionsPaginatedMock = jest.fn();
const countJobDescriptionsMock = jest.fn();
const createJobDescriptionMock = jest.fn();
const getJobDescriptionByIdMock = jest.fn();
const updateJobDescriptionMock = jest.fn();
const listJdScreeningSummariesMock = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
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

jest.mock('@/lib/jd-agent/service', () => ({
  runJDAgent: jest.fn(),
}));

jest.mock('@/lib/jd/job-description-repo', () => ({
  listJobDescriptionsPaginated: (...args: unknown[]) => listJobDescriptionsPaginatedMock(...args),
  countJobDescriptions: (...args: unknown[]) => countJobDescriptionsMock(...args),
  createJobDescription: (...args: unknown[]) => createJobDescriptionMock(...args),
  getJobDescriptionById: (...args: unknown[]) => getJobDescriptionByIdMock(...args),
  updateJobDescription: (...args: unknown[]) => updateJobDescriptionMock(...args),
}));

jest.mock('@/lib/jd/screening-summary', () => ({
  listJdScreeningSummaries: (...args: unknown[]) => listJdScreeningSummariesMock(...args),
  getDefaultJdScreeningSummary: () => ({
    status: 'not_started',
    totalCandidateCount: 0,
    qualifiedCandidateCount: 0,
    latestRunId: null,
    latestRunStatus: null,
    latestRunUpdatedAt: null,
  }),
}));

const runJDAgentMock = runJDAgent as jest.MockedFunction<typeof runJDAgent>;

const sampleJd: JD = {
  title: '前端工程师',
  summary: '负责增长业务体验建设',
  responsibilities: ['建设核心页面'],
  requirements: ['熟悉 TypeScript'],
  bonus: [],
  highlights: ['业务上下文清晰'],
};

const sampleAgentResponse = {
  jd: sampleJd,
  evaluation: {
    scores: { clarity: 8, completeness: 9, attractiveness: 8, specificity: 8 },
    issues: [],
    evidence: [],
    suggestions: [],
    rewrite_required: false,
  },
  decision: { improved: false, picked: 'original' as const },
  meta: {
    model: 'mock-jd-agent',
    promptVersion: 'jd_v3.2',
    action: 'initial_generate' as const,
    context: {
      used: true,
      query: '前端工程师',
      textLength: 10,
      matches: [],
      warnings: [],
    },
  },
};

describe('JD resource routes', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    listJobDescriptionsPaginatedMock.mockReset();
    countJobDescriptionsMock.mockReset();
    createJobDescriptionMock.mockReset();
    getJobDescriptionByIdMock.mockReset();
    updateJobDescriptionMock.mockReset();
    listJdScreeningSummariesMock.mockReset();
    runJDAgentMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    listJdScreeningSummariesMock.mockResolvedValue({});
    runJDAgentMock.mockResolvedValue(sampleAgentResponse);
  });

  it('lists current user job descriptions', async () => {
    listJobDescriptionsPaginatedMock.mockResolvedValueOnce([
      { id: 'jd-1', position: '前端工程师' },
    ]);
    countJobDescriptionsMock.mockResolvedValueOnce(1);

    const response = await listJds({ url: 'http://localhost/api/jd?page=1&limit=10' } as Request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.jobDescriptions[0].id).toBe('jd-1');
    expect(listJobDescriptionsPaginatedMock).toHaveBeenCalledWith({
      userId: 'u1',
      limit: 10,
      offset: 0,
      status: undefined,
    });
  });

  it('lists published job descriptions with screening summaries', async () => {
    listJobDescriptionsPaginatedMock.mockResolvedValueOnce([
      { id: 'jd-1', position: '前端工程师' },
    ]);
    countJobDescriptionsMock.mockResolvedValueOnce(1);
    listJdScreeningSummariesMock.mockResolvedValueOnce({
      'jd-1': {
        status: 'screened',
        totalCandidateCount: 3,
        qualifiedCandidateCount: 2,
        latestRunId: 'run-1',
        latestRunStatus: 'success',
        latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
      },
    });

    const response = await listJds({
      url: 'http://localhost/api/jd?page=1&limit=10&status=published',
    } as Request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobDescriptions[0].screeningSummary).toEqual({
      status: 'screened',
      totalCandidateCount: 3,
      qualifiedCandidateCount: 2,
      latestRunId: 'run-1',
      latestRunStatus: 'success',
      latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
    });
    expect(listJobDescriptionsPaginatedMock).toHaveBeenCalledWith({
      userId: 'u1',
      limit: 10,
      offset: 0,
      status: 'published',
    });
    expect(listJdScreeningSummariesMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionIds: ['jd-1'],
    });
  });

  it('creates a JD from department, position and position description', async () => {
    createJobDescriptionMock.mockResolvedValueOnce({ id: 'jd-1', content: sampleJd });
    const request = new Request('http://localhost/api/jd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: '技术部',
        position: '前端工程师',
        positionDescription: '负责增长业务体验建设',
        salaryRange: '30-50K',
        workLocations: ['上海张江', '远程'],
        tone: 'tech',
      }),
    });

    const response = await createJd(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.jobDescription.id).toBe('jd-1');
    expect(runJDAgentMock).toHaveBeenCalledWith(
      {
        action: 'initial_generate',
        jobInput: expect.stringContaining('职位：前端工程师'),
        tone: 'tech',
      },
      { userId: 'u1' },
    );
    expect(createJobDescriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        department: '技术部',
        position: '前端工程师',
        positionDescription: '负责增长业务体验建设',
        salaryRange: '30-50K',
        workLocations: ['上海张江', '远程'],
        content: sampleJd,
        generationMeta: sampleAgentResponse.meta,
      }),
    );
  });

  it('returns one JD by id with ownership check', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({ id: 'jd-1', content: sampleJd });

    const response = await getJd({} as Request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobDescription.id).toBe('jd-1');
    expect(getJobDescriptionByIdMock).toHaveBeenCalledWith('u1', 'jd-1');
  });

  it('returns one JD with a screening summary', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({ id: 'jd-1', content: sampleJd });
    listJdScreeningSummariesMock.mockResolvedValueOnce({
      'jd-1': {
        status: 'running',
        totalCandidateCount: 1,
        qualifiedCandidateCount: 1,
        latestRunId: 'run-2',
        latestRunStatus: 'running',
        latestRunUpdatedAt: '2026-07-06T03:30:00.000Z',
      },
    });

    const response = await getJd({} as Request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobDescription.screeningSummary.status).toBe('running');
    expect(listJdScreeningSummariesMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionIds: ['jd-1'],
    });
  });

  it('updates editable content and status', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({
      id: 'jd-1',
      status: 'created',
      content: sampleJd,
    });
    updateJobDescriptionMock.mockResolvedValueOnce({ id: 'jd-1', status: 'ready_to_publish' });
    const request = new Request('http://localhost/api/jd/jd-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { ...sampleJd, summary: '手动调整后的 JD' },
        status: 'ready_to_publish',
      }),
    });

    const response = await patchJd(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobDescription.status).toBe('ready_to_publish');
    expect(updateJobDescriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        id: 'jd-1',
        status: 'ready_to_publish',
        content: { ...sampleJd, summary: '手动调整后的 JD' },
      }),
    );
  });

  it('rejects PATCH updates for published JDs', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({
      id: 'jd-1',
      status: 'published',
      content: sampleJd,
    });
    const request = new Request('http://localhost/api/jd/jd-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { ...sampleJd, summary: '不应允许修改' },
      }),
    });

    const response = await patchJd(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('published job descriptions cannot be modified');
    expect(updateJobDescriptionMock).not.toHaveBeenCalled();
  });

  it('regenerates an existing JD using company context and saves the result', async () => {
    const editedJd = { ...sampleJd, summary: '页面当前编辑后的 JD' };
    getJobDescriptionByIdMock.mockResolvedValueOnce({
      id: 'jd-1',
      content: sampleJd,
      tone: 'tech',
    });
    updateJobDescriptionMock.mockResolvedValueOnce({ id: 'jd-1', content: sampleJd });
    const request = new Request('http://localhost/api/jd/jd-1/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentJd: editedJd, extraInstruction: '强调 AI 招聘经验' }),
    });

    const response = await regenerateJd(request, { params: Promise.resolve({ id: 'jd-1' }) });

    expect(response.status).toBe(200);
    expect(runJDAgentMock).toHaveBeenCalledWith(
      {
        action: 'continue_generate',
        currentJd: editedJd,
        extraInstruction: '强调 AI 招聘经验',
        tone: 'tech',
      },
      { userId: 'u1' },
    );
    expect(updateJobDescriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        id: 'jd-1',
        content: sampleJd,
        evaluation: sampleAgentResponse.evaluation,
        generationMeta: sampleAgentResponse.meta,
      }),
    );
  });

  it('rejects regeneration for published JDs', async () => {
    getJobDescriptionByIdMock.mockResolvedValueOnce({
      id: 'jd-1',
      status: 'published',
      content: sampleJd,
      tone: 'tech',
    });
    const request = new Request('http://localhost/api/jd/jd-1/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extraInstruction: '改成更热情' }),
    });

    const response = await regenerateJd(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('published job descriptions cannot be modified');
    expect(runJDAgentMock).not.toHaveBeenCalled();
    expect(updateJobDescriptionMock).not.toHaveBeenCalled();
  });
});
