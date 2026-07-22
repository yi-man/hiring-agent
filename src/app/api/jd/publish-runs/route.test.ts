/** @jest-environment node */

import { POST } from './route';
import { getCompanyProfileForUser } from '@/lib/company-profile/repo';
import { claimJobDescriptionForPublishing } from '@/lib/jd/job-description-repo';
import { reconcilePublishBatchWithRetry } from '@/lib/jd-publishing/publish-run-repo';
import {
  failInitializedPublishRun,
  initializePublishRun,
  schedulePublishRuns,
} from '@/lib/jd-publishing/publish-run-service';
import { resolveRecruitmentPlatformRuntimeConfigs } from '@/lib/recruitment-platform-config';
import type { JobDescriptionDto } from '@/types';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  requireAuth: jest.fn().mockResolvedValue({ user: { id: 'u1' } }),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

jest.mock('@/lib/company-profile/repo', () => ({
  getCompanyProfileForUser: jest.fn(),
}));

jest.mock('@/lib/jd/job-description-repo', () => ({
  getJobDescriptionById: jest.fn(),
  claimJobDescriptionForPublishing: jest.fn(),
}));

jest.mock('@/lib/jd-publishing/publish-run-repo', () => ({
  reconcilePublishBatchWithRetry: jest.fn(),
}));

jest.mock('@/lib/jd-publishing/publish-run-service', () => ({
  failInitializedPublishRun: jest.fn(),
  initializePublishRun: jest.fn(),
  schedulePublishRuns: jest.fn(),
}));

jest.mock('@/lib/recruitment-platform-config', () => ({
  resolveRecruitmentPlatformRuntimeConfigs: jest.fn(),
  findDuplicateRecruitmentPlatformTarget: jest.fn(
    (configs: Array<{ platform: string; siteFingerprint: string }>) => {
      const seen = new Map<string, string>();
      for (const config of configs) {
        const existing = seen.get(config.siteFingerprint);
        if (existing) return [existing, config.platform];
        seen.set(config.siteFingerprint, config.platform);
      }
      return null;
    },
  ),
}));

const getCompanyProfileMock = getCompanyProfileForUser as jest.MockedFunction<
  typeof getCompanyProfileForUser
>;
const claimJobDescriptionForPublishingMock =
  claimJobDescriptionForPublishing as jest.MockedFunction<typeof claimJobDescriptionForPublishing>;
const reconcilePublishBatchWithRetryMock = reconcilePublishBatchWithRetry as jest.MockedFunction<
  typeof reconcilePublishBatchWithRetry
>;
const failInitializedPublishRunMock = failInitializedPublishRun as jest.MockedFunction<
  typeof failInitializedPublishRun
>;
const initializePublishRunMock = initializePublishRun as jest.MockedFunction<
  typeof initializePublishRun
>;
const schedulePublishRunsMock = schedulePublishRuns as jest.MockedFunction<
  typeof schedulePublishRuns
>;
const resolveRecruitmentPlatformRuntimeConfigsMock =
  resolveRecruitmentPlatformRuntimeConfigs as jest.MockedFunction<
    typeof resolveRecruitmentPlatformRuntimeConfigs
  >;

function run(platform: string, index: number, batchId = 'batch-1') {
  const timestamp = '2026-07-17T00:00:00.000Z';
  return {
    id: `run-${index}`,
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    batchId,
    platform,
    status: 'pending' as const,
    currentStage: 'queued' as const,
    errorMessage: null,
    publishTaskId: null,
    skillId: null,
    startedAt: null,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const sampleJobDescription = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '构建产品界面',
  salaryRange: '30-50K',
  workLocations: ['上海'],
  hiringTarget: 2,
  onboardedCount: 0,
  tone: 'tech',
  status: 'ready_to_publish',
  content: {
    title: '前端工程师',
    summary: '构建产品界面',
    responsibilities: [],
    requirements: [],
    bonus: [],
    highlights: [],
  },
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
} satisfies JobDescriptionDto;

describe('POST /api/jd/publish-runs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveRecruitmentPlatformRuntimeConfigsMock.mockImplementation(async ({ platforms }) =>
      platforms.map((platform) => ({
        platform,
        baseUrl: `https://${platform}.example.com`,
        username: 'admin',
        password: 'secret',
        variables: {},
        siteFingerprint: `${platform}-fingerprint`,
        siteTemplatePlatform: platform,
      })),
    );
    claimJobDescriptionForPublishingMock.mockResolvedValue({
      ok: true,
      jobDescription: { ...sampleJobDescription, status: 'publishing' },
    });
    reconcilePublishBatchWithRetryMock.mockResolvedValue({
      ...sampleJobDescription,
      status: 'publish_failed',
    });
    initializePublishRunMock.mockImplementation(async (params) => ({
      run: run(
        params.settings.platform,
        params.settings.platform === 'boss' ? 1 : 2,
        params.batchId,
      ),
      jobDescription: params.jobDescription,
      settings: params.settings,
    }));
    failInitializedPublishRunMock.mockResolvedValue(true);
  });

  it('creates one independent run for each company default platform', async () => {
    getCompanyProfileMock.mockResolvedValueOnce({
      id: 'profile-1',
      userId: 'u1',
      name: '深海数据',
      supportedPlatforms: ['boss', 'liepin'],
      locations: [],
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
          keywords: ['TypeScript'],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.runs.map((item: { platform: string }) => item.platform)).toEqual([
      'boss',
      'liepin',
    ]);
    expect(initializePublishRunMock).toHaveBeenCalledTimes(2);
    expect(initializePublishRunMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ settings: expect.objectContaining({ platform: 'boss' }) }),
    );
    expect(initializePublishRunMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ settings: expect.objectContaining({ platform: 'liepin' }) }),
    );
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
    });
    expect(schedulePublishRunsMock).toHaveBeenCalledTimes(1);
    expect(schedulePublishRunsMock.mock.calls[0]?.[0].map((item) => item.run.platform)).toEqual([
      'boss',
      'liepin',
    ]);
  });

  it('rejects platforms that resolve to the same physical recruitment site', async () => {
    resolveRecruitmentPlatformRuntimeConfigsMock.mockResolvedValueOnce([
      {
        platform: 'zhilian',
        baseUrl: 'http://localhost:6183',
        username: 'admin',
        password: 'secret',
        variables: { newJobPath: '/employer/jobs/new' },
        siteFingerprint: 'same-site',
        siteTemplatePlatform: 'boss-like',
      },
      {
        platform: 'boss-like',
        baseUrl: 'http://localhost:6183',
        username: 'admin',
        password: 'secret',
        variables: { newJobPath: '/employer/jobs/new' },
        siteFingerprint: 'same-site',
        siteTemplatePlatform: 'boss-like',
      },
    ]);

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          platforms: ['zhilian', 'boss-like'],
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('智联招聘与 BOSS-like 指向同一招聘站点，请只保留一个平台后再发布');
    expect(claimJobDescriptionForPublishingMock).not.toHaveBeenCalled();
    expect(initializePublishRunMock).not.toHaveBeenCalled();
    expect(schedulePublishRunsMock).not.toHaveBeenCalled();
  });

  it('rejects publishing when the hiring target is not configured', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'conflict',
      conflict: 'hiring target is required before publishing',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          platform: 'boss',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('hiring target is required before publishing');
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledTimes(1);
    expect(initializePublishRunMock).not.toHaveBeenCalled();
  });

  it('does not republish an offline JD', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'conflict',
      conflict: 'job description cannot be published from status offline',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          platform: 'boss',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('job description cannot be published from status offline');
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledTimes(1);
    expect(initializePublishRunMock).not.toHaveBeenCalled();
  });

  it('marks an already-full JD filled instead of publishing it', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'conflict',
      conflict: 'hiring target has already been reached',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          platform: 'boss',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('hiring target has already been reached');
    expect(claimJobDescriptionForPublishingMock).toHaveBeenCalledTimes(1);
    expect(initializePublishRunMock).not.toHaveBeenCalled();
  });

  it('allows only one concurrent request to claim a JD for publishing', async () => {
    claimJobDescriptionForPublishingMock.mockResolvedValueOnce({
      ok: false,
      reason: 'concurrent_update',
    });

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          platform: 'boss',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('job description status changed, please retry');
    expect(initializePublishRunMock).not.toHaveBeenCalled();
  });

  it('releases a publishing claim when run creation fails', async () => {
    initializePublishRunMock.mockRejectedValueOnce(new Error('failed to create publish run'));

    const response = await POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          platform: 'boss',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('failed to create publish run');
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
      mode: 'batch',
      result: 'failed',
    });
    expect(schedulePublishRunsMock).not.toHaveBeenCalled();
  });

  it('waits for every platform initialization before reconciling a failed batch', async () => {
    getCompanyProfileMock.mockResolvedValueOnce({
      id: 'profile-1',
      userId: 'u1',
      name: '深海数据',
      supportedPlatforms: ['boss', 'liepin'],
      locations: [],
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    });
    const events: string[] = [];
    let resolveDelayedRun: (() => void) | undefined;
    const delayedRun = new Promise<Awaited<ReturnType<typeof initializePublishRun>>>((resolve) => {
      resolveDelayedRun = () => {
        events.push('liepin-created');
        resolve({
          run: run('liepin', 2),
          jobDescription: { ...sampleJobDescription, status: 'publishing' },
          settings: {
            platform: 'liepin',
            company: '深海数据',
            salary: '30-50K',
            location: '上海',
            keywords: [],
          },
        });
      };
    });
    initializePublishRunMock.mockImplementation(({ settings }) => {
      if (settings.platform === 'boss') {
        events.push('boss-failed');
        return Promise.reject(new Error('failed to create boss publish run'));
      }
      return delayedRun;
    });
    failInitializedPublishRunMock.mockImplementationOnce(async () => {
      events.push('liepin-failed');
      return true;
    });
    reconcilePublishBatchWithRetryMock.mockImplementationOnce(async () => {
      events.push('reconciled');
      return { ...sampleJobDescription, status: 'publish_failed' };
    });

    const responsePromise = POST(
      new Request('http://localhost/api/jd/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'jd-1',
          company: '深海数据',
          salary: '30-50K',
          location: '上海',
        }),
      }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(initializePublishRunMock).toHaveBeenCalledTimes(2);
    expect(reconcilePublishBatchWithRetryMock).not.toHaveBeenCalled();
    expect(schedulePublishRunsMock).not.toHaveBeenCalled();

    resolveDelayedRun?.();
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('failed to create boss publish run');
    expect(events).toEqual(['boss-failed', 'liepin-created', 'liepin-failed', 'reconciled']);
    expect(failInitializedPublishRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ run: expect.objectContaining({ id: 'run-2' }) }),
      expect.objectContaining({ message: 'failed to create boss publish run' }),
    );
    expect(schedulePublishRunsMock).not.toHaveBeenCalled();
    expect(reconcilePublishBatchWithRetryMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      batchId: expect.any(String),
      mode: 'batch',
      result: 'failed',
    });
  });
});
