/**
 * @jest-environment node
 */
import { POST } from './route';
import { createAndStartJobDescriptionRegenerateRun } from '@/lib/jd/regenerate-run-service';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import type { JobDescriptionRegenerateRunDto } from '@/lib/jd/regenerate-run-repo';

const requireAuthMock = jest.fn();

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

jest.mock('@/lib/jd/regenerate-run-service', () => ({
  createAndStartJobDescriptionRegenerateRun: jest.fn(),
}));

jest.mock('@/lib/jd/job-description-repo', () => ({
  getJobDescriptionById: jest.fn(),
}));

const createAndStartMock = createAndStartJobDescriptionRegenerateRun as jest.MockedFunction<
  typeof createAndStartJobDescriptionRegenerateRun
>;
const getJdMock = getJobDescriptionById as jest.MockedFunction<typeof getJobDescriptionById>;

const currentJd = {
  title: '高级前端工程师',
  summary: '摘要',
  responsibilities: ['职责'],
  requirements: ['要求'],
  bonus: [] as string[],
  highlights: [] as string[],
};

const run: JobDescriptionRegenerateRunDto = {
  id: 'jd-regen-run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  tone: 'tech',
  extraInstruction: '强调 AI',
  currentJd,
  status: 'pending',
  currentStage: 'queued',
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-07-13T08:00:00.000Z',
  updatedAt: '2026-07-13T08:00:00.000Z',
};

describe('/api/jd/[id]/regenerate-runs', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    createAndStartMock.mockReset();
    getJdMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('starts a regenerate run and responds with 202', async () => {
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '描述',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'created',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: '2026-07-13T08:00:00.000Z',
      updatedAt: '2026-07-13T08:00:00.000Z',
    });
    createAndStartMock.mockResolvedValueOnce(run);

    const request = new Request('http://localhost/api/jd/jd-1/regenerate-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentJd,
        extraInstruction: '强调 AI',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.run).toEqual(run);
    expect(body.run.status).toBe('pending');
    expect(createAndStartMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      tone: 'tech',
      extraInstruction: '强调 AI',
      currentJd,
    });
  });

  it('returns 404 when the JD is missing', async () => {
    getJdMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/jd/missing/regenerate-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'missing' }) },
    );

    expect(response.status).toBe(404);
    expect(createAndStartMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the JD is published', async () => {
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '描述',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'published',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: '2026-07-13T08:00:00.000Z',
      updatedAt: '2026-07-13T08:00:00.000Z',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/jd-1/regenerate-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentJd }),
      }),
      { params: Promise.resolve({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/published/i);
    expect(createAndStartMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid tone', async () => {
    getJdMock.mockResolvedValueOnce({
      id: 'jd-1',
      userId: 'u1',
      department: '技术部',
      position: '高级前端工程师',
      positionDescription: '描述',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      tone: 'tech',
      status: 'created',
      content: currentJd,
      evaluation: null,
      generationMeta: null,
      createdAt: '2026-07-13T08:00:00.000Z',
      updatedAt: '2026-07-13T08:00:00.000Z',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/jd-1/regenerate-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: 'not-a-tone' }),
      }),
      { params: Promise.resolve({ id: 'jd-1' }) },
    );

    expect(response.status).toBe(400);
    expect(createAndStartMock).not.toHaveBeenCalled();
  });
});
