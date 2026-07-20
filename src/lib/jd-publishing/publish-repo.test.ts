import {
  completePublishTask,
  createExploredPublishSkill,
  createNextActivePublishSkillVersion,
  createPublishTask,
  getActiveBrowserV2SkillByName,
  getActivePublishSkillByName,
  getActivePublishSkillFromDb,
  listPublishTasksForJobDescription,
  updatePublishTaskCurrentStep,
  upsertDefaultPublishSkill,
} from './publish-repo';
import { bossLikePublishSkill } from './skill-registry';
import type { PublishSkill } from './types';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    publishSkill: {
      create: jest.fn(),
      upsert: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    jobPublishTask: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    candidateScreeningRun: {
      groupBy: jest.fn(),
    },
    jobPublishTrace: {
      create: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    publishSkill: {
      create: jest.Mock;
      upsert: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    jobPublishTask: {
      create: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      groupBy: jest.Mock;
    };
    candidateScreeningRun: {
      groupBy: jest.Mock;
    };
    jobPublishTrace: {
      create: jest.Mock;
    };
  };
};

const now = new Date('2026-06-26T00:00:00.000Z');

const skillRow = (
  overrides: Partial<PublishSkill & { createdAt: Date; updatedAt: Date }> = {},
) => ({
  ...bossLikePublishSkill,
  isActive: true,
  inputSchema: bossLikePublishSkill.inputSchema,
  meta: { success_rate: 0.75, usage_count: 4, created_from: 'explore' as const },
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

function browserV2ScreeningSkill(): PublishSkill {
  return {
    ...bossLikePublishSkill,
    id: 'screen-v5',
    name: 'screen_candidates',
    version: 1,
    meta: { dsl_version: 'browser-v2', created_from: 'explore' },
  };
}

describe('publish repository', () => {
  beforeEach(() => {
    prismaMock.publishSkill.create.mockReset();
    prismaMock.publishSkill.upsert.mockReset();
    prismaMock.publishSkill.findFirst.mockReset();
    prismaMock.publishSkill.updateMany.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        publishSkill: prismaMock.publishSkill,
        jobPublishTask: prismaMock.jobPublishTask,
        jobPublishTrace: prismaMock.jobPublishTrace,
        $executeRaw: prismaMock.$executeRaw,
      }),
    );
    prismaMock.$executeRaw.mockReset();
    prismaMock.jobPublishTask.create.mockReset();
    prismaMock.jobPublishTask.findMany.mockReset();
    prismaMock.jobPublishTask.updateMany.mockReset();
    prismaMock.jobPublishTask.groupBy.mockReset();
    prismaMock.jobPublishTask.groupBy.mockResolvedValue([]);
    prismaMock.candidateScreeningRun.groupBy.mockReset();
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValue([]);
    prismaMock.jobPublishTrace.create.mockReset();
  });

  it('upserts the built-in boss-like skill by name, platform, and version', async () => {
    prismaMock.publishSkill.upsert.mockResolvedValueOnce(skillRow());

    const result = await upsertDefaultPublishSkill(bossLikePublishSkill);

    expect(prismaMock.publishSkill.upsert).toHaveBeenCalledWith({
      where: {
        name_platform_siteFingerprint_version: {
          name: 'publish_jd',
          platform: 'boss-like',
          siteFingerprint: 'default',
          version: 1,
        },
      },
      create: expect.objectContaining({
        id: 'boss-like-publish-jd',
        name: 'publish_jd',
        platform: 'boss-like',
        siteFingerprint: 'default',
        version: 1,
        isActive: true,
        steps: bossLikePublishSkill.steps,
        meta: { success_rate: 0, usage_count: 0, created_from: 'agent' },
      }),
      update: expect.objectContaining({
        description: bossLikePublishSkill.description,
        isActive: true,
        steps: bossLikePublishSkill.steps,
        meta: { success_rate: 0, usage_count: 0, created_from: 'agent' },
      }),
    });
    expect(result.id).toBe('boss-like-publish-jd');
  });

  it('loads the latest active skill for a platform', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(skillRow());

    const result = await getActivePublishSkillFromDb('boss-like');

    expect(prismaMock.publishSkill.findFirst).toHaveBeenCalledWith({
      where: {
        name: 'publish_jd',
        platform: 'boss-like',
        siteFingerprint: 'default',
        isActive: true,
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(result?.steps[0]?.id).toBe('open_new_job');
    expect(result?.meta).toEqual({
      success_rate: 0.75,
      usage_count: 4,
      created_from: 'explore',
    });
  });

  it('does not reuse a 0%-successful current publish workflow when an older version succeeded', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(
      skillRow({ id: 'publish-current-v2', version: 2 }),
    );
    prismaMock.jobPublishTask.groupBy.mockResolvedValueOnce([
      { skillId: 'publish-old-v1', status: 'success', _count: { _all: 3 } },
      { skillId: 'publish-current-v2', status: 'failed', _count: { _all: 2 } },
    ]);

    await expect(getActivePublishSkillFromDb('boss-like')).resolves.toBeNull();

    expect(prismaMock.jobPublishTask.groupBy).toHaveBeenCalledWith({
      by: ['skillId', 'status'],
      where: { skillId: { in: ['publish-current-v2'] } },
      _count: { _all: true },
    });
  });

  it('loads the active workflow for an explicit name and platform', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce({
      ...skillRow(),
      name: 'screen_candidates',
    });

    await getActivePublishSkillByName({ name: 'screen_candidates', platform: 'boss-like' });

    expect(prismaMock.publishSkill.findFirst).toHaveBeenCalledWith({
      where: {
        name: 'screen_candidates',
        platform: 'boss-like',
        siteFingerprint: 'default',
        isActive: true,
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
  });

  it('does not select an active legacy screen_candidates workflow', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValue(
      skillRow({ name: 'screen_candidates', version: 4, meta: { created_from: 'explore' } }),
    );

    await expect(
      getActiveBrowserV2SkillByName({ name: 'screen_candidates', platform: 'boss-like' }),
    ).resolves.toBeNull();
  });

  it('selects an active browser-v2 screen_candidates workflow', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(
      skillRow({
        id: 'screen-v5',
        name: 'screen_candidates',
        version: 5,
        meta: { dsl_version: 'browser-v2', created_from: 'explore' },
      }),
    );

    await expect(
      getActiveBrowserV2SkillByName({ name: 'screen_candidates', platform: 'boss-like' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'screen-v5',
        name: 'screen_candidates',
        version: 5,
        meta: { dsl_version: 'browser-v2', created_from: 'explore' },
      }),
    );
  });

  it('does not reuse a 0%-successful current screening workflow when an older version succeeded', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(
      skillRow({
        id: 'screen-current-v6',
        name: 'screen_candidates',
        version: 6,
        meta: { dsl_version: 'browser-v2', created_from: 'explore' },
      }),
    );
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValueOnce([
      { skillId: 'screen-old-v5', status: 'success', _count: { _all: 4 } },
      { skillId: 'screen-current-v6', status: 'failed', _count: { _all: 1 } },
    ]);

    await expect(
      getActiveBrowserV2SkillByName({ name: 'screen_candidates', platform: 'boss-like' }),
    ).resolves.toBeNull();

    expect(prismaMock.candidateScreeningRun.groupBy).toHaveBeenCalledWith({
      by: ['skillId', 'status'],
      where: { skillId: { in: ['screen-current-v6'] } },
      _count: { _all: true },
    });
  });

  it('allocates browser-v2 v5 after legacy v4', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(
      skillRow({
        id: 'screen-v4',
        name: 'screen_candidates',
        version: 4,
        isActive: true,
        meta: { created_from: 'explore' },
      }),
    );
    prismaMock.publishSkill.create.mockResolvedValueOnce(
      skillRow({
        id: 'screen-v5',
        name: 'screen_candidates',
        version: 5,
        isActive: true,
        meta: { dsl_version: 'browser-v2', created_from: 'explore' },
      }),
    );

    const created = await createExploredPublishSkill(browserV2ScreeningSkill());

    expect(created.version).toBe(5);
    expect(prismaMock.publishSkill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 5,
        meta: { dsl_version: 'browser-v2', created_from: 'explore' },
      }),
    });
    expect(prismaMock.publishSkill.updateMany).toHaveBeenCalledWith({
      where: {
        name: 'screen_candidates',
        platform: 'boss-like',
        siteFingerprint: 'default',
        isActive: true,
        id: { not: 'screen-v5' },
      },
      data: { isActive: false },
    });
  });

  it('stores an explored skill as the active browser-authored skill', async () => {
    const exploredSkill = {
      ...bossLikePublishSkill,
      id: 'explored-skill-1',
      meta: { success_rate: 0, usage_count: 0, created_from: 'explore' as const },
    };
    prismaMock.publishSkill.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(null);
    prismaMock.publishSkill.create.mockResolvedValueOnce({
      ...exploredSkill,
      isActive: true,
      inputSchema: exploredSkill.inputSchema,
      createdAt: now,
      updatedAt: now,
    });

    const result = await createExploredPublishSkill(exploredSkill);

    expect(prismaMock.publishSkill.updateMany).toHaveBeenCalledWith({
      where: {
        name: 'publish_jd',
        platform: 'boss-like',
        siteFingerprint: 'default',
        isActive: true,
        id: { not: 'explored-skill-1' },
      },
      data: { isActive: false },
    });
    expect(prismaMock.publishSkill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'explored-skill-1',
        name: 'publish_jd',
        platform: 'boss-like',
        version: 1,
        isActive: true,
        meta: { success_rate: 0, usage_count: 0, created_from: 'explore' },
      }),
    });
    expect(result.meta?.created_from).toBe('explore');
  });

  it('locks a workflow name and platform before allocating an explored version', async () => {
    const exploredSkill = {
      ...bossLikePublishSkill,
      id: 'explored-skill-lock',
      meta: { success_rate: 0, usage_count: 0, created_from: 'explore' as const },
    };
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(null);
    prismaMock.publishSkill.create.mockResolvedValueOnce({
      ...exploredSkill,
      isActive: true,
      inputSchema: exploredSkill.inputSchema,
      createdAt: now,
      updatedAt: now,
    });
    prismaMock.publishSkill.updateMany.mockResolvedValueOnce({ count: 0 });

    await createExploredPublishSkill(exploredSkill);

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('stores an explored skill as the next version when inactive history already exists', async () => {
    const exploredSkill = {
      ...bossLikePublishSkill,
      id: 'explored-skill-2',
      version: 1,
      meta: { success_rate: 0, usage_count: 0, created_from: 'explore' as const },
    };
    prismaMock.publishSkill.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce({
      id: 'old-skill',
      version: 3,
    });
    prismaMock.publishSkill.create.mockResolvedValueOnce({
      ...exploredSkill,
      version: 4,
      isActive: true,
      inputSchema: exploredSkill.inputSchema,
      createdAt: now,
      updatedAt: now,
    });

    const result = await createExploredPublishSkill(exploredSkill);

    expect(prismaMock.publishSkill.findFirst).toHaveBeenCalledWith({
      where: { name: 'publish_jd', platform: 'boss-like', siteFingerprint: 'default' },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(prismaMock.publishSkill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'explored-skill-2',
        version: 4,
        isActive: true,
        meta: { success_rate: 0, usage_count: 0, created_from: 'explore' },
      }),
    });
    expect(result.version).toBe(4);
  });

  it('creates the next active skill version without overwriting the old version', async () => {
    const repairedSteps = [
      {
        id: 'open_repaired',
        type: 'action' as const,
        action: 'navigate' as const,
        params: { url: '{{target.newJobUrl}}' },
        next: 'done',
      },
      { id: 'done', type: 'end' as const },
    ];
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce({ version: 1 });
    prismaMock.publishSkill.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.publishSkill.create.mockResolvedValueOnce({
      ...bossLikePublishSkill,
      id: 'publish_jd-boss-like-default-v2',
      version: 2,
      steps: repairedSteps,
      isActive: true,
      inputSchema: bossLikePublishSkill.inputSchema,
      meta: { created_from: 'agent', success_rate: 0, usage_count: 0 },
      createdAt: now,
      updatedAt: now,
    });

    const result = await createNextActivePublishSkillVersion({
      previousSkill: bossLikePublishSkill,
      steps: repairedSteps,
      meta: { created_from: 'agent', success_rate: 0, usage_count: 0 },
    });

    expect(prismaMock.publishSkill.updateMany).toHaveBeenCalledWith({
      where: {
        name: 'publish_jd',
        platform: 'boss-like',
        siteFingerprint: 'default',
        isActive: true,
        id: { not: 'publish_jd-boss-like-default-v2' },
      },
      data: { isActive: false },
    });
    expect(prismaMock.publishSkill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'publish_jd',
        platform: 'boss-like',
        version: 2,
        isActive: true,
        steps: repairedSteps,
      }),
    });
    expect(result.version).toBe(2);
    expect(result.steps).toEqual(repairedSteps);
  });

  it('repairs a stale inactive v1 as v3 before deactivating active v2', async () => {
    const staleV1 = {
      ...bossLikePublishSkill,
      id: 'screen-candidates-v1',
      name: 'screen_candidates',
      version: 1,
      isActive: false,
    };
    const repairedSteps = staleV1.steps;
    const activeV2 = {
      ...skillRow(),
      id: 'screen-candidates-v2',
      name: 'screen_candidates',
      version: 2,
      isActive: true,
    };
    const persistedV3 = {
      ...activeV2,
      id: 'screen_candidates-boss-like-default-v3',
      version: 3,
      isActive: true,
      steps: repairedSteps,
    };
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(activeV2);
    prismaMock.publishSkill.create.mockResolvedValueOnce(persistedV3);
    prismaMock.publishSkill.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await createNextActivePublishSkillVersion({
      previousSkill: staleV1,
      steps: repairedSteps,
    });

    expect(result).toEqual(
      expect.objectContaining({ id: persistedV3.id, version: 3, isActive: true }),
    );
    expect(prismaMock.publishSkill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'screen_candidates-boss-like-default-v3',
        name: 'screen_candidates',
        version: 3,
        isActive: true,
      }),
    });
    expect(prismaMock.publishSkill.updateMany).toHaveBeenCalledWith({
      where: {
        name: 'screen_candidates',
        platform: 'boss-like',
        siteFingerprint: 'default',
        isActive: true,
        id: { not: 'screen_candidates-boss-like-default-v3' },
      },
      data: { isActive: false },
    });
    expect(prismaMock.publishSkill.create.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.publishSkill.updateMany.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('retries a version collision and recalculates the next repair version', async () => {
    const staleV1 = {
      ...bossLikePublishSkill,
      id: 'screen-candidates-v1',
      name: 'screen_candidates',
      version: 1,
      isActive: false,
    };
    const uniqueViolation = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const persistedV3 = {
      ...staleV1,
      id: 'screen_candidates-boss-like-default-v3',
      version: 3,
      isActive: true,
      inputSchema: staleV1.inputSchema,
      createdAt: now,
      updatedAt: now,
    };
    prismaMock.publishSkill.findFirst
      .mockResolvedValueOnce({ version: 1 })
      .mockResolvedValueOnce({ version: 2 });
    prismaMock.publishSkill.create
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce(persistedV3);
    prismaMock.publishSkill.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      createNextActivePublishSkillVersion({ previousSkill: staleV1, steps: staleV1.steps }),
    ).resolves.toEqual(expect.objectContaining({ id: persistedV3.id, version: 3 }));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.publishSkill.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ id: persistedV3.id, version: 3 }),
      }),
    );
  });

  it('creates a running publish task for a JD', async () => {
    prismaMock.jobPublishTask.create.mockResolvedValueOnce({
      id: 'task-1',
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      batchId: 'batch-1',
      skillId: 'boss-like-publish-jd',
      platform: 'boss-like',
      input: { title: '高级前端工程师' },
      currentStep: 'open_new_job',
      status: 'running',
      errorMessage: null,
      trace: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await createPublishTask({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      batchId: 'batch-1',
      skillId: 'boss-like-publish-jd',
      platform: 'boss-like',
      input: { title: '高级前端工程师' },
      currentStep: 'open_new_job',
    });

    expect(prismaMock.jobPublishTask.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        skillId: 'boss-like-publish-jd',
        platform: 'boss-like',
        input: { title: '高级前端工程师' },
        currentStep: 'open_new_job',
        status: 'running',
      },
      include: { trace: true },
    });
    expect(result.status).toBe('running');
    expect(result.batchId).toBe('batch-1');
  });

  it('updates the publish task current step while the graph advances', async () => {
    prismaMock.jobPublishTask.updateMany.mockResolvedValueOnce({ count: 1 });
    const fenceNow = new Date('2026-07-20T10:00:00.000Z');

    await expect(
      updatePublishTaskCurrentStep({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        expectedCurrentStep: 'open_new_job',
        currentStep: 'fill_title',
        now: fenceNow,
      }),
    ).resolves.toBe(true);

    expect(prismaMock.jobPublishTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        status: 'running',
        currentStep: 'open_new_job',
        jobDescription: {
          status: 'publishing',
          activePublishBatchId: 'batch-1',
          publishLeaseExpiresAt: { gt: fenceNow },
        },
      },
      data: { currentStep: 'fill_title' },
    });
  });

  it('does not advance a recovered publish task that is no longer running', async () => {
    prismaMock.jobPublishTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const fenceNow = new Date('2026-07-20T10:00:00.000Z');

    await expect(
      updatePublishTaskCurrentStep({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        expectedCurrentStep: 'open_new_job',
        currentStep: 'fill_title',
        now: fenceNow,
      }),
    ).resolves.toBe(false);

    expect(prismaMock.jobPublishTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        status: 'running',
        currentStep: 'open_new_job',
        jobDescription: {
          status: 'publishing',
          activePublishBatchId: 'batch-1',
          publishLeaseExpiresAt: { gt: fenceNow },
        },
      },
      data: { currentStep: 'fill_title' },
    });
  });

  it('fails closed before advancing a legacy publish task without a batch', async () => {
    await expect(
      updatePublishTaskCurrentStep({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: null,
        expectedCurrentStep: 'open_new_job',
        currentStep: 'fill_title',
      }),
    ).resolves.toBe(false);

    expect(prismaMock.jobPublishTask.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the task batch or unexpired JD lease no longer matches', async () => {
    prismaMock.jobPublishTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const fenceNow = new Date('2026-07-20T10:00:00.000Z');

    await expect(
      updatePublishTaskCurrentStep({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        expectedCurrentStep: 'fill_title',
        currentStep: 'fill_title',
        now: fenceNow,
      }),
    ).resolves.toBe(false);

    expect(prismaMock.jobPublishTask.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'task-1',
        batchId: 'batch-1',
        jobDescription: {
          status: 'publishing',
          activePublishBatchId: 'batch-1',
          publishLeaseExpiresAt: { gt: fenceNow },
        },
      }),
      data: { currentStep: 'fill_title' },
    });
  });

  it('stores task completion and trace steps atomically after winning the CAS', async () => {
    prismaMock.jobPublishTask.updateMany.mockResolvedValueOnce({ count: 1 });
    const fenceNow = new Date('2026-07-20T10:00:00.000Z');
    prismaMock.jobPublishTrace.create.mockResolvedValueOnce({
      id: 'trace-1',
      taskId: 'task-1',
      skillId: 'boss-like-publish-jd',
      steps: [{ stepId: 'open_new_job' }],
      status: 'success',
      createdAt: now,
    });

    await expect(
      completePublishTask({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        skillId: 'boss-like-publish-jd',
        status: 'success',
        steps: [
          { stepId: 'open_new_job', action: 'navigate', params: {}, result: { success: true } },
        ],
        now: fenceNow,
      }),
    ).resolves.toBe(true);

    expect(prismaMock.jobPublishTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        skillId: 'boss-like-publish-jd',
        status: 'running',
        currentStep: null,
        jobDescription: {
          status: 'publishing',
          activePublishBatchId: 'batch-1',
          publishLeaseExpiresAt: { gt: fenceNow },
        },
      },
      data: { status: 'success', currentStep: null, errorMessage: null },
    });
    expect(prismaMock.jobPublishTrace.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        skillId: 'boss-like-publish-jd',
        status: 'success',
        steps: [
          { stepId: 'open_new_job', action: 'navigate', params: {}, result: { success: true } },
        ],
      },
    });
  });

  it('does not create a trace after losing the running-to-terminal CAS', async () => {
    prismaMock.jobPublishTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const fenceNow = new Date('2026-07-20T10:00:00.000Z');

    await expect(
      completePublishTask({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        skillId: 'boss-like-publish-jd',
        status: 'success',
        steps: [],
        now: fenceNow,
      }),
    ).resolves.toBe(false);

    expect(prismaMock.jobPublishTrace.create).not.toHaveBeenCalled();
  });

  it('fails closed before terminal completion when the task has no batch', async () => {
    await expect(
      completePublishTask({
        taskId: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: null,
        skillId: 'boss-like-publish-jd',
        status: 'failed',
        steps: [],
        errorMessage: 'legacy task',
      }),
    ).resolves.toBe(false);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.jobPublishTrace.create).not.toHaveBeenCalled();
  });

  it('lists recent publish tasks for the current user and JD', async () => {
    prismaMock.jobPublishTask.findMany.mockResolvedValueOnce([
      {
        id: 'task-1',
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        batchId: 'batch-1',
        skillId: 'boss-like-publish-jd',
        platform: 'boss-like',
        input: { title: '高级前端工程师' },
        currentStep: null,
        status: 'success',
        errorMessage: null,
        trace: {
          taskId: 'task-1',
          skillId: 'boss-like-publish-jd',
          steps: [],
          status: 'success',
          createdAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await listPublishTasksForJobDescription({
      userId: 'u1',
      jobDescriptionId: 'jd-1',
      limit: 5,
    });

    expect(prismaMock.jobPublishTask.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', jobDescriptionId: 'jd-1' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { trace: true },
    });
    expect(result[0]?.trace?.status).toBe('success');
  });
});
