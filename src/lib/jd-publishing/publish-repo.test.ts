import {
  completePublishTask,
  createExploredPublishSkill,
  createNextActivePublishSkillVersion,
  createPublishTask,
  getActivePublishSkillByName,
  getActivePublishSkillFromDb,
  listPublishTasksForJobDescription,
  updatePublishTaskCurrentStep,
  upsertDefaultPublishSkill,
} from './publish-repo';
import { bossLikePublishSkill } from './skill-registry';

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
      update: jest.fn(),
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
      update: jest.Mock;
    };
    jobPublishTrace: {
      create: jest.Mock;
    };
  };
};

const now = new Date('2026-06-26T00:00:00.000Z');

const skillRow = {
  ...bossLikePublishSkill,
  isActive: true,
  inputSchema: bossLikePublishSkill.inputSchema,
  meta: { success_rate: 0.75, usage_count: 4, created_from: 'explore' },
  createdAt: now,
  updatedAt: now,
};

describe('publish repository', () => {
  beforeEach(() => {
    prismaMock.publishSkill.create.mockReset();
    prismaMock.publishSkill.upsert.mockReset();
    prismaMock.publishSkill.findFirst.mockReset();
    prismaMock.publishSkill.updateMany.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({ publishSkill: prismaMock.publishSkill, $executeRaw: prismaMock.$executeRaw }),
    );
    prismaMock.$executeRaw.mockReset();
    prismaMock.jobPublishTask.create.mockReset();
    prismaMock.jobPublishTask.findMany.mockReset();
    prismaMock.jobPublishTask.update.mockReset();
    prismaMock.jobPublishTrace.create.mockReset();
  });

  it('upserts the built-in boss-like skill by name, platform, and version', async () => {
    prismaMock.publishSkill.upsert.mockResolvedValueOnce(skillRow);

    const result = await upsertDefaultPublishSkill(bossLikePublishSkill);

    expect(prismaMock.publishSkill.upsert).toHaveBeenCalledWith({
      where: {
        name_platform_version: {
          name: 'publish_jd',
          platform: 'boss-like',
          version: 1,
        },
      },
      create: expect.objectContaining({
        id: 'boss-like-publish-jd',
        name: 'publish_jd',
        platform: 'boss-like',
        version: 1,
        isActive: true,
        steps: bossLikePublishSkill.steps,
      }),
      update: expect.objectContaining({
        description: bossLikePublishSkill.description,
        isActive: true,
        steps: bossLikePublishSkill.steps,
      }),
    });
    expect(result.id).toBe('boss-like-publish-jd');
  });

  it('loads the latest active skill for a platform', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce(skillRow);

    const result = await getActivePublishSkillFromDb('boss-like');

    expect(prismaMock.publishSkill.findFirst).toHaveBeenCalledWith({
      where: { name: 'publish_jd', platform: 'boss-like', isActive: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(result?.steps[0]?.id).toBe('open_new_job');
    expect(result?.meta).toEqual({
      success_rate: 0.75,
      usage_count: 4,
      created_from: 'explore',
    });
  });

  it('loads the active workflow for an explicit name and platform', async () => {
    prismaMock.publishSkill.findFirst.mockResolvedValueOnce({
      ...skillRow,
      name: 'screen_candidates',
    });

    await getActivePublishSkillByName({ name: 'screen_candidates', platform: 'boss-like' });

    expect(prismaMock.publishSkill.findFirst).toHaveBeenCalledWith({
      where: { name: 'screen_candidates', platform: 'boss-like', isActive: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
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
      where: { name: 'publish_jd', platform: 'boss-like' },
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
      id: 'boss-like-publish-jd-v2',
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
        isActive: true,
        id: { not: 'boss-like-publish-jd-v2' },
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
      ...skillRow,
      id: 'screen-candidates-v2',
      name: 'screen_candidates',
      version: 2,
      isActive: true,
    };
    const persistedV3 = {
      ...activeV2,
      id: 'screen_candidates-boss-like-v3',
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
        id: 'screen_candidates-boss-like-v3',
        name: 'screen_candidates',
        version: 3,
        isActive: true,
      }),
    });
    expect(prismaMock.publishSkill.updateMany).toHaveBeenCalledWith({
      where: {
        name: 'screen_candidates',
        platform: 'boss-like',
        isActive: true,
        id: { not: 'screen_candidates-boss-like-v3' },
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
      id: 'screen_candidates-boss-like-v3',
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
      skillId: 'boss-like-publish-jd',
      platform: 'boss-like',
      input: { title: '高级前端工程师' },
      currentStep: 'open_new_job',
    });

    expect(prismaMock.jobPublishTask.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        jobDescriptionId: 'jd-1',
        skillId: 'boss-like-publish-jd',
        platform: 'boss-like',
        input: { title: '高级前端工程师' },
        currentStep: 'open_new_job',
        status: 'running',
      },
      include: { trace: true },
    });
    expect(result.status).toBe('running');
  });

  it('updates the publish task current step while the graph advances', async () => {
    prismaMock.jobPublishTask.update.mockResolvedValueOnce({ id: 'task-1' });

    await updatePublishTaskCurrentStep({
      taskId: 'task-1',
      currentStep: 'fill_title',
    });

    expect(prismaMock.jobPublishTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { currentStep: 'fill_title' },
    });
  });

  it('stores task completion and trace steps', async () => {
    prismaMock.jobPublishTask.update.mockResolvedValueOnce({ id: 'task-1' });
    prismaMock.jobPublishTrace.create.mockResolvedValueOnce({
      id: 'trace-1',
      taskId: 'task-1',
      skillId: 'boss-like-publish-jd',
      steps: [{ stepId: 'open_new_job' }],
      status: 'success',
      createdAt: now,
    });

    await completePublishTask({
      taskId: 'task-1',
      skillId: 'boss-like-publish-jd',
      status: 'success',
      steps: [
        { stepId: 'open_new_job', action: 'navigate', params: {}, result: { success: true } },
      ],
    });

    expect(prismaMock.jobPublishTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
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

  it('lists recent publish tasks for the current user and JD', async () => {
    prismaMock.jobPublishTask.findMany.mockResolvedValueOnce([
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
