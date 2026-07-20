/**
 * @jest-environment node
 */
import { POST } from './route';
import { applyJobDescriptionLifecycle } from '@/lib/jd/job-description-repo';

jest.mock('@/lib/auth/session', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })),
  UnauthorizedError: class UnauthorizedError extends Error {
    status = 401;
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/jd/job-description-repo', () => ({
  applyJobDescriptionLifecycle: jest.fn(),
}));

const applyLifecycleMock = applyJobDescriptionLifecycle as jest.MockedFunction<
  typeof applyJobDescriptionLifecycle
>;

function request(body: unknown) {
  return new Request('http://localhost/api/jd/jd-1/lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const jobDescription = {
  id: 'jd-1',
  userId: 'u1',
  status: 'offline',
  hiringTarget: 2,
  onboardedCount: 1,
} as never;

describe('POST /api/jd/[id]/lifecycle', () => {
  beforeEach(() => {
    applyLifecycleMock.mockReset();
  });

  it('applies a validated lifecycle action for the authenticated owner', async () => {
    applyLifecycleMock.mockResolvedValueOnce({
      ok: true,
      changed: true,
      jobDescription,
    });

    const response = await POST(request({ action: 'take_offline' }), {
      params: Promise.resolve({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobDescription.status).toBe('offline');
    expect(applyLifecycleMock).toHaveBeenCalledWith({
      userId: 'u1',
      id: 'jd-1',
      request: { action: 'take_offline' },
    });
  });

  it('rejects invalid payloads before touching the repository', async () => {
    const response = await POST(request({ action: 'set_hiring_target', hiringTarget: 0 }), {
      params: Promise.resolve({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('招聘人数必须是 1 到 999 的整数');
    expect(applyLifecycleMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404, '未找到该 JD'],
    ['invalid_transition', 409, '当前 JD 状态不允许执行此操作'],
    ['hiring_target_required', 409, '重新开放招聘前请先设置招聘人数'],
    ['hiring_target_reached', 409, '招聘人数必须大于已入职人数'],
    ['operation_in_progress', 409, '招聘外发动作正在执行，请等待完成后重试'],
    ['concurrent_update', 409, 'JD 状态已变化，请刷新后重试'],
  ] as const)('maps %s failures to HTTP %i', async (reason, expectedStatus, message) => {
    applyLifecycleMock.mockResolvedValueOnce({ ok: false, reason });

    const response = await POST(request({ action: 'take_offline' }), {
      params: Promise.resolve({ id: 'jd-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(expectedStatus);
    expect(body.error).toBe(message);
  });
});
