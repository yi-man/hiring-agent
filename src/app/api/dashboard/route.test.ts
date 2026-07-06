/**
 * @jest-environment node
 */
import { GET } from './route';
import { getDashboardOverview, parseDashboardFilters } from '@/lib/dashboard/overview';

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

jest.mock('@/lib/dashboard/overview', () => ({
  getDashboardOverview: jest.fn(),
  parseDashboardFilters: jest.fn(),
}));

const getDashboardOverviewMock = getDashboardOverview as jest.MockedFunction<
  typeof getDashboardOverview
>;
const parseDashboardFiltersMock = parseDashboardFilters as jest.MockedFunction<
  typeof parseDashboardFilters
>;

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getDashboardOverviewMock.mockReset();
    parseDashboardFiltersMock.mockReset();
    requireAuthMock.mockResolvedValue({ user: { id: 'u1' } });
    parseDashboardFiltersMock.mockReturnValue({
      status: 'published',
      platform: 'boss-like',
      limit: 25,
    });
    getDashboardOverviewMock.mockResolvedValue({
      summary: {
        recruitingJobs: 1,
        readyToPublishJobs: 0,
        publishingJobs: 0,
        publishFailedJobs: 0,
        activeCandidates: 2,
      },
      statusCounts: [],
      platforms: [],
      jobs: [],
      recentTasks: [],
      filters: { status: 'published', platform: 'boss-like', limit: 25 },
    });
  });

  it('returns dashboard overview for authenticated users', async () => {
    const response = await GET(
      new Request('http://localhost/api/dashboard?status=published&platform=boss-like'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.recruitingJobs).toBe(1);
    expect(getDashboardOverviewMock).toHaveBeenCalledWith({
      userId: 'u1',
      filters: { status: 'published', platform: 'boss-like', limit: 25 },
    });
  });

  it('returns 400 for invalid filters', async () => {
    parseDashboardFiltersMock.mockImplementationOnce(() => {
      throw new Error('status is invalid');
    });

    const response = await GET(new Request('http://localhost/api/dashboard?status=paused'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('status is invalid');
  });

  it('returns 400 for invalid platform filters', async () => {
    parseDashboardFiltersMock.mockImplementationOnce(() => {
      throw new Error('platform is invalid');
    });

    const response = await GET(new Request('http://localhost/api/dashboard?platform=unknown'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('platform is invalid');
  });

  it('returns 401 when auth is missing', async () => {
    requireAuthMock.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    );

    const response = await GET(new Request('http://localhost/api/dashboard'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});
