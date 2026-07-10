/**
 * @jest-environment node
 */
import { GET } from './route';
import {
  getJobDescriptionCreateRun,
  listJobDescriptionCreateRunEvents,
  type JobDescriptionCreateRunDto,
  type JobDescriptionCreateRunEventDto,
} from '@/lib/jd/create-run-repo';

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

jest.mock('@/lib/jd/create-run-repo', () => ({
  getJobDescriptionCreateRun: jest.fn(),
  listJobDescriptionCreateRunEvents: jest.fn(),
}));

const getRunMock = getJobDescriptionCreateRun as jest.MockedFunction<
  typeof getJobDescriptionCreateRun
>;
const listEventsMock = listJobDescriptionCreateRunEvents as jest.MockedFunction<
  typeof listJobDescriptionCreateRunEvents
>;

const run: JobDescriptionCreateRunDto = {
  id: 'jd-create-run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  department: '技术部',
  position: '高级前端工程师',
  positionDescription: '负责招聘工作台体验',
  salaryRange: '25-40K',
  workLocations: ['上海'],
  tone: 'tech',
  status: 'success',
  currentStage: 'completed',
  errorMessage: null,
  startedAt: '2026-07-10T08:00:00.000Z',
  finishedAt: '2026-07-10T08:00:10.000Z',
  createdAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T08:00:10.000Z',
};

const events: JobDescriptionCreateRunEventDto[] = [
  {
    id: 'event-1',
    userId: 'u1',
    runId: 'jd-create-run-1',
    stage: 'completed',
    level: 'success',
    message: 'JD 创建完成',
    detail: { jobDescriptionId: 'jd-1' },
    createdAt: '2026-07-10T08:00:10.000Z',
  },
];

describe('/api/jd/create-runs/[runId]', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getRunMock.mockReset();
    listEventsMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns the run with ordered progress events', async () => {
    getRunMock.mockResolvedValueOnce(run);
    listEventsMock.mockResolvedValueOnce(events);

    const response = await GET(new Request('http://localhost/api/jd/create-runs/jd-create-run-1'), {
      params: Promise.resolve({ runId: 'jd-create-run-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run).toEqual(run);
    expect(body.events).toEqual(events);
    expect(getRunMock).toHaveBeenCalledWith({ userId: 'u1', runId: 'jd-create-run-1' });
    expect(listEventsMock).toHaveBeenCalledWith({
      userId: 'u1',
      runId: 'jd-create-run-1',
      limit: 200,
    });
  });

  it('returns 404 when the run is not owned by the current user', async () => {
    getRunMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/jd/create-runs/missing'), {
      params: Promise.resolve({ runId: 'missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('JD create run not found');
    expect(listEventsMock).not.toHaveBeenCalled();
  });
});
