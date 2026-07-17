/** @jest-environment node */

import { POST } from './route';
import { getCompanyProfileForUser } from '@/lib/company-profile/repo';
import { updateJobDescription } from '@/lib/jd/job-description-repo';
import { createAndStartPublishRun } from '@/lib/jd-publishing/publish-run-service';

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
  updateJobDescription: jest.fn(),
}));

jest.mock('@/lib/jd-publishing/publish-run-service', () => ({
  createAndStartPublishRun: jest.fn(),
}));

const getCompanyProfileMock = getCompanyProfileForUser as jest.MockedFunction<
  typeof getCompanyProfileForUser
>;
const updateJobDescriptionMock = updateJobDescription as jest.MockedFunction<
  typeof updateJobDescription
>;
const createRunMock = createAndStartPublishRun as jest.MockedFunction<
  typeof createAndStartPublishRun
>;

function run(platform: string, index: number) {
  const timestamp = '2026-07-17T00:00:00.000Z';
  return {
    id: `run-${index}`,
    userId: 'u1',
    jobDescriptionId: 'jd-1',
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

describe('POST /api/jd/publish-runs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateJobDescriptionMock.mockResolvedValue(null);
    createRunMock.mockImplementation(async ({ settings }) =>
      run(settings.platform, settings.platform === 'boss' ? 1 : 2),
    );
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
    expect(createRunMock).toHaveBeenCalledTimes(2);
    expect(createRunMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ settings: expect.objectContaining({ platform: 'boss' }) }),
    );
    expect(createRunMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ settings: expect.objectContaining({ platform: 'liepin' }) }),
    );
  });
});
