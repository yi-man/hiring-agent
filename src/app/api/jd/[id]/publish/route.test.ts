/**
 * @jest-environment node
 */
import { GET, POST } from './route';
import { publishJobDescriptionToBossLike } from '@/lib/jd-publishing/service';
import { listPublishTasksForJobDescription } from '@/lib/jd-publishing/publish-repo';
import type { JD, JobDescriptionDto } from '@/types';

const requireAuthMock = jest.fn();
const claimJobDescriptionForPublishingMock = jest.fn();
const recoverStaleJobDescriptionPublishingMock = jest.fn();
const runWithJobDescriptionPublishLeaseMock = jest.fn();
const reconcilePublishBatchWithRetryMock = jest.fn();
const listPublishTasksForJobDescriptionMock =
  listPublishTasksForJobDescription as jest.MockedFunction<
    typeof listPublishTasksForJobDescription
  >;

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

jest.mock('@/lib/jd/job-description-repo', () => ({
  claimJobDescriptionForPublishing: (...args: unknown[]) =>
    claimJobDescriptionForPublishingMock(...args),
  recoverStaleJobDescriptionPublishing: (...args: unknown[]) =>
    recoverStaleJobDescriptionPublishingMock(...args),
  runWithJobDescriptionPublishLease: (...args: unknown[]) =>
    runWithJobDescriptionPublishLeaseMock(...args),
}));

jest.mock('@/lib/jd-publishing/publish-run-repo', () => ({
  reconcilePublishBatchWithRetry: (...args: unknown[]) =>
    reconcilePublishBatchWithRetryMock(...args),
}));

jest.mock('@/lib/jd-publishing/service', () => ({
  publishJobDescriptionToBossLike: jest.fn(),
}));

jest.mock('@/lib/jd-publishing/publish-repo', () => ({
  listPublishTasksForJobDescription: jest.fn(),
}));

const publishJobDescriptionToBossLikeMock = publishJobDescriptionToBossLike as jest.MockedFunction<
  typeof publishJobDescriptionToBossLike
>;

const sampleJd: JD = {
  title: '高级前端工程师',
  summary: '负责招聘产品前端体验',
  responsibilities: ['建设发布流程'],
  requirements: ['熟悉 TypeScript'],
  bonus: [],
  highlights: [],
};

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责招聘产品前端体验',
  salaryRange: null,
  workLocations: [],
  hiringTarget: 2,
  onboardedCount: 0,
  tone: 'tech',
  status: 'ready_to_publish',
  content: sampleJd,
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
};

describe('POST /api/jd/[id]/publish', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    claimJobDescriptionForPublishingMock.mockReset();
    recoverStaleJobDescriptionPublishingMock.mockReset();
    runWithJobDescriptionPublishLeaseMock.mockReset();
    reconcilePublishBatchWithRetryMock.mockReset();
    listPublishTasksForJobDescriptionMock.mockReset();
    publishJobDescriptionToBossLikeMock.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    recoverStaleJobDescriptionPublishingMock.mockResolvedValue(sampleJobDescription);
    runWithJobDescriptionPublishLeaseMock.mockImplementation(
      ({ operation }: { operation: () => Promise<unknown> }) => operation(),
    );
    claimJobDescriptionForPublishingMock.mockResolvedValue({
      ok: true,
      jobDescription: { ...sampleJobDescription, status: 'publishing' },
    });
    reconcilePublishBatchWithRetryMock.mockImplementation(async (params) => ({
      ...sampleJobDescription,
      status: params.result === 'success' ? 'published' : 'publish_failed',
    }));
    publishJobDescriptionToBossLikeMock.mockResolvedValue({
      taskId: 'task-1',
      skillId: 'boss-like-publish-jd',
      status: 'success',
      trace: {
        taskId: 'task-1',
        skillId: 'boss-like-publish-jd',
        steps: [],
        status: 'success',
        createdAt: '2026-06-26T00:00:00.000Z',
      },
    });
  });

  it('lists recent publish tasks for a JD', async () => {
    listPublishTasksForJobDescriptionMock.mockResolvedValueOnce([
      {
        id: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        skillId: 'boss-like-publish-jd',
        platform: 'boss-like',
        input: { title: '高级前端工程师' },
        currentStep: null,
        status: 'success',
        errorMessage: null,
        trace: {
          taskId: 'task-1',
          skillId: 'boss-like-publish-jd',
          status: 'success',
          steps: [],
          createdAt: '2026-06-26T00:00:00.000Z',
        },
        createdAt: '2026-06-26T00:00:00.000Z',
        updatedAt: '2026-06-26T00:00:01.000Z',
      },
    ]);

    const response = await GET(new Request('http://localhost/api/jd/jd-1/publish'), {
      params: Promise.resolve({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tasks).toHaveLength(1);
    expect(listPublishTasksForJobDescriptionMock).toHaveBeenCalledWith({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      limit: 5,
    });
    expect(recoverStaleJobDescriptionPublishingMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
    });
  });

  it('publishes a JD with boss-like settings and marks it published', async () => {
    const request = new Request('http://localhost/api/jd/jd-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
        keywords: ['TypeScript'],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.task.status).toBe('success');
    expect(body.jobDescription.status).toBe('published');
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
    });
    expect(publishJobDescriptionToBossLikeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: expect.objectContaining({ id: 'jd-1', status: 'publishing' }),
        settings: expect.objectContaining({
          company: '星河智能',
          salary: '25-40K',
          location: '上海',
        }),
        batchId: expect.any(String),
      }),
    );
    expect(runWithJobDescriptionPublishLeaseMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
      operation: expect.any(Function),
    });
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
      mode: 'direct',
      result: 'success',
    });
  });

  it('rejects publishing when the hiring target is not configured', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'conflict',
      conflict: 'hiring target is required before publishing',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/jd-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'boss-like',
          company: '星河智能',
          salary: '25-40K',
          location: '上海',
        }),
      }),
      { params: Promise.resolve({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('hiring target is required before publishing');
    expect(publishJobDescriptionToBossLikeMock).not.toHaveBeenCalled();
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledTimes(1);
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
  });

  it('does not republish a filled JD', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'conflict',
      conflict: 'job description cannot be published from status filled',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/jd-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'boss-like',
          company: '星河智能',
          salary: '25-40K',
          location: '上海',
        }),
      }),
      { params: Promise.resolve({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('job description cannot be published from status filled');
    expect(publishJobDescriptionToBossLikeMock).not.toHaveBeenCalled();
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledTimes(1);
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
  });

  it('marks publish_failed and returns task trace when execution fails', async () => {
    publishJobDescriptionToBossLikeMock.mockResolvedValueOnce({
      taskId: 'task-1',
      skillId: 'boss-like-publish-jd',
      status: 'failed',
      trace: {
        taskId: 'task-1',
        skillId: 'boss-like-publish-jd',
        steps: [
          {
            stepId: 'fill_title',
            action: 'fill',
            params: { locator: '职位名称' },
            result: { success: false, error: 'selector not found' },
          },
        ],
        status: 'failed',
        createdAt: '2026-06-26T00:00:00.000Z',
      },
    });
    const request = new Request('http://localhost/api/jd/jd-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.task.status).toBe('failed');
    expect(body.jobDescription.status).toBe('publish_failed');
    expect(body.error).toBe('JD publish execution failed');
  });

  it('marks publish_failed when the browser publishing service throws', async () => {
    publishJobDescriptionToBossLikeMock.mockRejectedValueOnce(new Error('browser launch failed'));
    const request = new Request('http://localhost/api/jd/jd-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'jd-1' }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('browser launch failed');
    expect(body.jobDescription.status).toBe('publish_failed');
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
      mode: 'direct',
      result: 'failed',
    });
  });

  it('marks an already-full JD filled instead of publishing it', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'conflict',
      conflict: 'hiring target has already been reached',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/jd-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'boss-like',
          company: '星河智能',
          salary: '25-40K',
          location: '上海',
        }),
      }),
      { params: Promise.resolve({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('hiring target has already been reached');
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledTimes(1);
    expect(publishJobDescriptionToBossLikeMock).not.toHaveBeenCalled();
  });

  it('allows only one concurrent request to claim a JD for publishing', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'concurrent_update',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/jd-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'boss-like',
          company: '星河智能',
          salary: '25-40K',
          location: '上海',
        }),
      }),
      { params: Promise.resolve({ id: 'jd-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('job description status changed, please retry');
    expect(publishJobDescriptionToBossLikeMock).not.toHaveBeenCalled();
  });
});
