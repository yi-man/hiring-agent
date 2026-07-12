/**
 * @jest-environment node
 */
import { GET, POST } from './route';
import { createAndStartJobDescriptionCreateRun } from '@/lib/jd/create-run-service';
import {
  failStaleJobDescriptionCreateRuns,
  listJobDescriptionCreateRuns,
} from '@/lib/jd/create-run-repo';
import type { JobDescriptionCreateRunDto } from '@/lib/jd/create-run-repo';

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

jest.mock('@/lib/jd/create-run-service', () => ({
  createAndStartJobDescriptionCreateRun: jest.fn(),
}));

jest.mock('@/lib/jd/create-run-repo', () => ({
  listJobDescriptionCreateRuns: jest.fn(),
  failStaleJobDescriptionCreateRuns: jest.fn(),
}));

const createAndStartMock = createAndStartJobDescriptionCreateRun as jest.MockedFunction<
  typeof createAndStartJobDescriptionCreateRun
>;
const listRunsMock = listJobDescriptionCreateRuns as jest.MockedFunction<
  typeof listJobDescriptionCreateRuns
>;
const failStaleMock = failStaleJobDescriptionCreateRuns as jest.MockedFunction<
  typeof failStaleJobDescriptionCreateRuns
>;

const run: JobDescriptionCreateRunDto = {
  id: 'jd-create-run-1',
  userId: 'u1',
  jobDescriptionId: null,
  department: '技术部',
  position: '高级前端工程师',
  positionDescription: '负责招聘工作台体验',
  salaryRange: '25-40K',
  workLocations: ['上海'],
  tone: 'tech',
  status: 'pending',
  currentStage: 'queued',
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T08:00:00.000Z',
};

describe('/api/jd/create-runs', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    createAndStartMock.mockReset();
    listRunsMock.mockReset();
    failStaleMock.mockReset();
    failStaleMock.mockResolvedValue(0);
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('starts a JD create run and responds immediately with 202', async () => {
    createAndStartMock.mockResolvedValueOnce(run);
    const request = new Request('http://localhost/api/jd/create-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: '技术部',
        position: '高级前端工程师',
        positionDescription: '负责招聘工作台体验',
        salaryRange: '25-40K',
        workLocations: ['上海'],
        tone: 'tech',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.run).toEqual(run);
    expect(createAndStartMock).toHaveBeenCalledWith({
      userId: 'u1',
      request: expect.objectContaining({
        position: '高级前端工程师',
        tone: 'tech',
      }),
    });
  });

  it('lists recent JD create runs, optionally scoped to a generated JD', async () => {
    listRunsMock.mockResolvedValueOnce([run]);

    const response = await GET(
      new Request('http://localhost/api/jd/create-runs?jobDescriptionId=jd-1&limit=3'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runs).toEqual([run]);
    expect(failStaleMock).toHaveBeenCalledWith({ userId: 'u1' });
    expect(listRunsMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      limit: 3,
    });
  });
});
