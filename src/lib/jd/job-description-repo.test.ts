import {
  applyJobDescriptionLifecycle,
  claimJobDescriptionForPublishing,
  createJobDescription,
  getJobDescriptionById,
  listJobDescriptionsPaginated,
  reconcileJobDescriptionPublishResult,
  updateJobDescriptionLifecycle,
  updateJobDescription,
  updateMutableJobDescription,
} from '@/lib/jd/job-description-repo';
import type { JD, JDAgentResponse } from '@/types';

jest.mock('@/lib/prisma', () => ({
  prisma: (() => {
    const jobDescription = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    };
    const jobDescriptionPublishRun = {
      findMany: jest.fn(),
    };
    const $queryRaw = jest.fn();
    return {
      jobDescription,
      jobDescriptionPublishRun,
      $queryRaw,
      $transaction: jest.fn((callback) =>
        callback({ jobDescription, jobDescriptionPublishRun, $queryRaw }),
      ),
    };
  })(),
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    jobDescription: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    jobDescriptionPublishRun: {
      findMany: jest.Mock;
    };
  };
};

const sampleJd: JD = {
  title: '前端工程师',
  summary: '负责增长业务体验建设',
  responsibilities: ['建设核心页面'],
  requirements: ['熟悉 TypeScript'],
  bonus: ['有招聘系统经验'],
  highlights: ['业务上下文清晰'],
};

const sampleMeta: JDAgentResponse['meta'] = {
  model: 'mock-jd-agent',
  promptVersion: 'jd_v3.2',
  action: 'initial_generate',
  context: {
    used: true,
    query: '前端工程师',
    textLength: 20,
    matches: [],
    warnings: [],
  },
};

const row = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责增长业务体验建设',
  salaryRange: '30-50K',
  workLocations: ['上海张江', '远程'],
  tone: 'tech',
  status: 'created',
  hiringTarget: null,
  activePublishBatchId: null,
  content: sampleJd,
  evaluation: null,
  generationMeta: sampleMeta,
  createdAt: new Date('2026-06-25T01:00:00.000Z'),
  updatedAt: new Date('2026-06-25T02:00:00.000Z'),
};

describe('job description repository', () => {
  beforeEach(() => {
    prismaMock.jobDescription.create.mockReset();
    prismaMock.jobDescription.findFirst.mockReset();
    prismaMock.jobDescription.findMany.mockReset();
    prismaMock.jobDescription.count.mockReset();
    prismaMock.jobDescription.updateMany.mockReset();
    prismaMock.jobDescriptionPublishRun.findMany.mockReset();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation((callback) =>
      callback({
        jobDescription: prismaMock.jobDescription,
        jobDescriptionPublishRun: prismaMock.jobDescriptionPublishRun,
        $queryRaw: prismaMock.$queryRaw,
      }),
    );
  });

  it('creates a user-owned JD record and maps json content', async () => {
    prismaMock.jobDescription.create.mockResolvedValueOnce(row);

    const result = await createJobDescription({
      userId: 'u1',
      department: '技术部',
      position: '前端工程师',
      positionDescription: '负责增长业务体验建设',
      salaryRange: '30-50K',
      workLocations: ['上海张江', '远程'],
      tone: 'tech',
      content: sampleJd,
      evaluation: null,
      generationMeta: sampleMeta,
    });

    expect(prismaMock.jobDescription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        department: '技术部',
        position: '前端工程师',
        positionDescription: '负责增长业务体验建设',
        salaryRange: '30-50K',
        workLocations: ['上海张江', '远程'],
        tone: 'tech',
        status: 'created',
        content: sampleJd,
        generationMeta: sampleMeta,
      }),
    });
    expect(result).toMatchObject({
      id: 'jd-1',
      status: 'created',
      content: sampleJd,
      generationMeta: sampleMeta,
      salaryRange: '30-50K',
      workLocations: ['上海张江', '远程'],
      hiringTarget: null,
      onboardedCount: 0,
      updatedAt: '2026-06-25T02:00:00.000Z',
    });
  });

  it('lists only the current user JDs ordered by latest update', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([
      { ...row, hiringTarget: 2, _count: { candidateScreeningResults: 1 } },
    ]);

    const result = await listJobDescriptionsPaginated({ userId: 'u1', limit: 20, offset: 0 });

    expect(prismaMock.jobDescription.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { updatedAt: 'desc' },
      skip: 0,
      take: 20,
      include: {
        _count: {
          select: {
            candidateScreeningResults: { where: { interviewStage: 'onboarded' } },
          },
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.position).toBe('前端工程师');
    expect(result[0]).toMatchObject({ hiringTarget: 2, onboardedCount: 1 });
  });

  it('gets a JD by id with user ownership', async () => {
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      hiringTarget: 3,
      _count: { candidateScreeningResults: 2 },
    });

    const result = await getJobDescriptionById('u1', 'jd-1');

    expect(prismaMock.jobDescription.findFirst).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1' },
      include: {
        _count: {
          select: {
            candidateScreeningResults: { where: { interviewStage: 'onboarded' } },
          },
        },
      },
    });
    expect(result?.id).toBe('jd-1');
    expect(result).toMatchObject({ hiringTarget: 3, onboardedCount: 2 });
  });

  it('updates a JD only when it belongs to the current user', async () => {
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'ready_to_publish',
      salaryRange: '40-60K',
      workLocations: ['远程'],
      hiringTarget: 4,
      content: { ...sampleJd, summary: '手动调整后的 JD' },
    });

    const result = await updateJobDescription({
      userId: 'u1',
      id: 'jd-1',
      status: 'ready_to_publish',
      salaryRange: '40-60K',
      workLocations: ['远程'],
      hiringTarget: 4,
      content: { ...sampleJd, summary: '手动调整后的 JD' },
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1' },
      data: expect.objectContaining({
        status: 'ready_to_publish',
        salaryRange: '40-60K',
        workLocations: ['远程'],
        hiringTarget: 4,
        content: { ...sampleJd, summary: '手动调整后的 JD' },
      }),
    });
    expect(result?.status).toBe('ready_to_publish');
    expect(result?.content.summary).toBe('手动调整后的 JD');
  });

  it('updates lifecycle state only from the expected status for the owning user', async () => {
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'filled',
      hiringTarget: 2,
      _count: { candidateScreeningResults: 2 },
    });

    const result = await updateJobDescriptionLifecycle({
      userId: 'u1',
      id: 'jd-1',
      expectedStatus: 'published',
      status: 'filled',
      hiringTarget: 2,
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'published' },
      data: { status: 'filled', hiringTarget: 2 },
    });
    expect(result).toMatchObject({ status: 'filled', hiringTarget: 2, onboardedCount: 2 });
  });

  it('returns null when a lifecycle transition loses the expected-status race', async () => {
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await updateJobDescriptionLifecycle({
      userId: 'u1',
      id: 'jd-1',
      expectedStatus: 'published',
      status: 'offline',
    });

    expect(result).toBeNull();
    expect(prismaMock.jobDescription.findFirst).not.toHaveBeenCalled();
  });

  it('checks publish eligibility and claims the JD under the same row lock', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'jd-1' }]);
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'ready_to_publish',
        hiringTarget: 2,
        _count: { candidateScreeningResults: 1 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'publishing',
        hiringTarget: 2,
        activePublishBatchId: 'batch-1',
        _count: { candidateScreeningResults: 1 },
      });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await claimJobDescriptionForPublishing({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'ready_to_publish' },
      data: { status: 'publishing', activePublishBatchId: 'batch-1' },
    });
    expect(result).toMatchObject({ ok: true, jobDescription: { status: 'publishing' } });
  });

  it('marks a full JD filled instead of claiming it for publishing', async () => {
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'ready_to_publish',
        hiringTarget: 1,
        _count: { candidateScreeningResults: 1 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'filled',
        hiringTarget: 1,
        _count: { candidateScreeningResults: 1 },
      });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await claimJobDescriptionForPublishing({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'ready_to_publish' },
      data: { status: 'filled', activePublishBatchId: null },
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'conflict',
      conflict: 'hiring target has already been reached',
    });
  });

  it('locks the JD row and applies lifecycle decisions with a fresh onboarded count', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'jd-1' }]);
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'filled',
        hiringTarget: 2,
        activePublishBatchId: 'batch-old',
        _count: { candidateScreeningResults: 2 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'published',
        hiringTarget: 3,
        _count: { candidateScreeningResults: 2 },
      });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await applyJobDescriptionLifecycle({
      userId: 'u1',
      id: 'jd-1',
      request: { action: 'reopen', hiringTarget: 3 },
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'filled' },
      data: { status: 'published', hiringTarget: 3, activePublishBatchId: null },
    });
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      jobDescription: { status: 'published', hiringTarget: 3, onboardedCount: 2 },
    });
  });

  it('clears a stale publish batch when taking a JD offline', async () => {
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'published',
        hiringTarget: 2,
        activePublishBatchId: 'batch-old',
        _count: { candidateScreeningResults: 1 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'offline',
        hiringTarget: 2,
        activePublishBatchId: null,
        _count: { candidateScreeningResults: 1 },
      });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    await applyJobDescriptionLifecycle({
      userId: 'u1',
      id: 'jd-1',
      request: { action: 'take_offline' },
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'published' },
      data: { status: 'offline', activePublishBatchId: null },
    });
  });

  it('keeps filled and offline JDs closed when only the target changes', async () => {
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'filled',
        hiringTarget: 2,
        _count: { candidateScreeningResults: 2 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'filled',
        hiringTarget: 3,
        _count: { candidateScreeningResults: 2 },
      });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await applyJobDescriptionLifecycle({
      userId: 'u1',
      id: 'jd-1',
      request: { action: 'set_hiring_target', hiringTarget: 3 },
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'filled' },
      data: { status: 'filled', hiringTarget: 3 },
    });
    expect(result).toMatchObject({ ok: true, jobDescription: { status: 'filled' } });
  });

  it('marks a published JD filled when its target is already met', async () => {
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'published',
        hiringTarget: 3,
        _count: { candidateScreeningResults: 2 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'filled',
        hiringTarget: 2,
        _count: { candidateScreeningResults: 2 },
      });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await applyJobDescriptionLifecycle({
      userId: 'u1',
      id: 'jd-1',
      request: { action: 'set_hiring_target', hiringTarget: 2 },
    });

    expect(result).toMatchObject({ ok: true, jobDescription: { status: 'filled' } });
  });

  it('rejects lifecycle target updates for draft and terminal statuses', async () => {
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'created',
      hiringTarget: null,
      _count: { candidateScreeningResults: 0 },
    });

    await expect(
      applyJobDescriptionLifecycle({
        userId: 'u1',
        id: 'jd-1',
        request: { action: 'set_hiring_target', hiringTarget: 2 },
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_transition' });
    expect(prismaMock.jobDescription.updateMany).not.toHaveBeenCalled();
  });

  it('rejects reopening without capacity and reports concurrent transitions', async () => {
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'filled',
      hiringTarget: 2,
      _count: { candidateScreeningResults: 2 },
    });

    await expect(
      applyJobDescriptionLifecycle({
        userId: 'u1',
        id: 'jd-1',
        request: { action: 'reopen' },
      }),
    ).resolves.toEqual({ ok: false, reason: 'hiring_target_reached' });

    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'published',
      hiringTarget: 2,
      _count: { candidateScreeningResults: 1 },
    });
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      applyJobDescriptionLifecycle({
        userId: 'u1',
        id: 'jd-1',
        request: { action: 'take_offline' },
      }),
    ).resolves.toEqual({ ok: false, reason: 'concurrent_update' });
  });

  it('keeps a multi-platform batch publishing while any run is pending', async () => {
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'publishing',
      hiringTarget: 2,
      activePublishBatchId: 'batch-1',
      _count: { candidateScreeningResults: 1 },
    });
    prismaMock.jobDescriptionPublishRun.findMany.mockResolvedValueOnce([
      { status: 'failed' },
      { status: 'pending' },
    ]);

    const result = await reconcileJobDescriptionPublishResult({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });

    expect(prismaMock.jobDescription.updateMany).not.toHaveBeenCalled();
    expect(result?.status).toBe('publishing');
  });

  it('publishes a batch as soon as any platform succeeds even if another is pending', async () => {
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'publishing',
        hiringTarget: 2,
        activePublishBatchId: 'batch-1',
        _count: { candidateScreeningResults: 1 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'published',
        hiringTarget: 2,
        activePublishBatchId: null,
        _count: { candidateScreeningResults: 1 },
      });
    prismaMock.jobDescriptionPublishRun.findMany.mockResolvedValueOnce([
      { status: 'pending' },
      { status: 'success' },
    ]);
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await reconcileJobDescriptionPublishResult({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1', status: 'publishing' },
      data: { status: 'published', activePublishBatchId: null },
    });
    expect(result?.status).toBe('published');
  });

  it('marks a batch failed only after every platform failed', async () => {
    prismaMock.jobDescription.findFirst
      .mockResolvedValueOnce({
        ...row,
        status: 'publishing',
        hiringTarget: 2,
        activePublishBatchId: 'batch-1',
        _count: { candidateScreeningResults: 0 },
      })
      .mockResolvedValueOnce({
        ...row,
        status: 'publish_failed',
        hiringTarget: 2,
        activePublishBatchId: null,
        _count: { candidateScreeningResults: 0 },
      });
    prismaMock.jobDescriptionPublishRun.findMany.mockResolvedValueOnce([
      { status: 'failed' },
      { status: 'failed' },
    ]);
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await reconcileJobDescriptionPublishResult({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });

    expect(result?.status).toBe('publish_failed');
  });

  it('ignores a late result from an older publish batch', async () => {
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'publishing',
      hiringTarget: 2,
      activePublishBatchId: 'batch-2',
      _count: { candidateScreeningResults: 0 },
    });

    const result = await reconcileJobDescriptionPublishResult({
      userId: 'u1',
      id: 'jd-1',
      batchId: 'batch-1',
      mode: 'batch',
      result: 'failed',
    });

    expect(prismaMock.jobDescriptionPublishRun.findMany).not.toHaveBeenCalled();
    expect(prismaMock.jobDescription.updateMany).not.toHaveBeenCalled();
    expect(result?.status).toBe('publishing');
  });

  it('updates a JD only while it has not been published', async () => {
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'ready_to_publish',
      content: { ...sampleJd, summary: '手动调整后的 JD' },
    });

    const result = await updateMutableJobDescription({
      userId: 'u1',
      id: 'jd-1',
      status: 'ready_to_publish',
      content: { ...sampleJd, summary: '手动调整后的 JD' },
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'jd-1',
        userId: 'u1',
        status: { in: ['created', 'ready_to_publish', 'publish_failed'] },
      },
      data: expect.objectContaining({
        status: 'ready_to_publish',
        content: { ...sampleJd, summary: '手动调整后的 JD' },
      }),
    });
    expect(result?.status).toBe('ready_to_publish');
  });
});
