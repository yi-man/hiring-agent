import {
  completePublishTask,
  createPublishTask,
  getActivePublishSkillFromDb,
  listPublishTasksForJobDescription,
  upsertDefaultPublishSkill,
} from './publish-repo';
import { bossLikePublishSkill } from './skill-registry';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    publishSkill: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
    },
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
      upsert: jest.Mock;
      findFirst: jest.Mock;
    };
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
  createdAt: now,
  updatedAt: now,
};

describe('publish repository', () => {
  beforeEach(() => {
    prismaMock.publishSkill.upsert.mockReset();
    prismaMock.publishSkill.findFirst.mockReset();
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
