/**
 * @jest-environment node
 */
import { GET } from './route';
import {
  failStaleJobDescriptionRegenerateRuns,
  getJobDescriptionRegenerateRun,
  listJobDescriptionRegenerateRunEvents,
  type JobDescriptionRegenerateRunDto,
  type JobDescriptionRegenerateRunEventDto,
} from '@/lib/jd/regenerate-run-repo';

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

jest.mock('@/lib/jd/regenerate-run-repo', () => ({
  getJobDescriptionRegenerateRun: jest.fn(),
  listJobDescriptionRegenerateRunEvents: jest.fn(),
  failStaleJobDescriptionRegenerateRuns: jest.fn(),
}));

const getRunMock = getJobDescriptionRegenerateRun as jest.MockedFunction<
  typeof getJobDescriptionRegenerateRun
>;
const listEventsMock = listJobDescriptionRegenerateRunEvents as jest.MockedFunction<
  typeof listJobDescriptionRegenerateRunEvents
>;
const failStaleMock = failStaleJobDescriptionRegenerateRuns as jest.MockedFunction<
  typeof failStaleJobDescriptionRegenerateRuns
>;

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
  status: 'success',
  currentStage: 'completed',
  errorMessage: null,
  startedAt: '2026-07-13T08:00:00.000Z',
  finishedAt: '2026-07-13T08:00:10.000Z',
  createdAt: '2026-07-13T08:00:00.000Z',
  updatedAt: '2026-07-13T08:00:10.000Z',
};

const events: JobDescriptionRegenerateRunEventDto[] = [
  {
    id: 'event-1',
    userId: 'u1',
    runId: 'jd-regen-run-1',
    jobDescriptionId: 'jd-1',
    stage: 'completed',
    level: 'success',
    message: 'JD 重新生成完成',
    detail: { jobDescriptionId: 'jd-1' },
    createdAt: '2026-07-13T08:00:10.000Z',
  },
];

describe('/api/jd/[id]/regenerate-runs/[runId]', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getRunMock.mockReset();
    listEventsMock.mockReset();
    failStaleMock.mockReset();
    failStaleMock.mockResolvedValue(0);
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns the run with ordered progress events after stale sweep', async () => {
    getRunMock.mockResolvedValueOnce(run);
    listEventsMock.mockResolvedValueOnce(events);

    const response = await GET(
      new Request('http://localhost/api/jd/jd-1/regenerate-runs/jd-regen-run-1'),
      { params: Promise.resolve({ id: 'jd-1', runId: 'jd-regen-run-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run).toEqual(run);
    expect(body.events).toEqual(events);
    expect(failStaleMock).toHaveBeenCalledWith({ userId: 'u1' });
    expect(getRunMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'jd-regen-run-1',
      jobDescriptionId: 'jd-1',
    });
    expect(listEventsMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'jd-regen-run-1',
      limit: 200,
    });
  });

  it('returns 404 when the run does not belong to the JD', async () => {
    getRunMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request('http://localhost/api/jd/other-jd/regenerate-runs/jd-regen-run-1'),
      { params: Promise.resolve({ id: 'other-jd', runId: 'jd-regen-run-1' }) },
    );

    expect(response.status).toBe(404);
    expect(listEventsMock).not.toHaveBeenCalled();
  });
});
