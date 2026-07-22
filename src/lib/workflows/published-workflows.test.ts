import {
  getPublishedWorkflowDetail,
  listLatestActivePublishedWorkflows,
} from './published-workflows';
import type { PublishStep } from '@/lib/jd-publishing/types';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    publishSkill: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    jobPublishTask: {
      groupBy: jest.fn(),
    },
    candidateScreeningRun: {
      groupBy: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    publishSkill: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    jobPublishTask: {
      groupBy: jest.Mock;
    };
    candidateScreeningRun: {
      groupBy: jest.Mock;
    };
  };
};

const now = new Date('2026-07-07T08:00:00.000Z');

const steps: PublishStep[] = [
  {
    id: 'open_new_job',
    type: 'action',
    action: 'navigate',
    params: { url: '{{target.newJobUrl}}' },
    next: 'done',
  },
  { id: 'done', type: 'end' },
];

function skillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'boss-like-publish-jd-v2',
    name: 'publish_jd',
    platform: 'boss-like',
    siteFingerprint: 'default',
    description: 'Publish a generated JD.',
    version: 2,
    isActive: true,
    inputSchema: { title: 'string' },
    variables: {},
    steps,
    meta: { success_rate: 0.9, usage_count: 12, created_from: 'agent' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('published workflow repository', () => {
  beforeEach(() => {
    prismaMock.publishSkill.findMany.mockReset();
    prismaMock.publishSkill.findUnique.mockReset();
    prismaMock.jobPublishTask.groupBy.mockReset();
    prismaMock.candidateScreeningRun.groupBy.mockReset();
  });

  it('lists the latest active workflow per name and platform with cumulative usage and current-version success rate', async () => {
    prismaMock.publishSkill.findMany
      .mockResolvedValueOnce([
        skillRow({
          id: 'zhilian-publish-jd-new',
          platform: 'zhilian',
          siteFingerprint: 'site-new',
          version: 1,
          updatedAt: new Date('2026-07-08T08:00:00.000Z'),
        }),
        skillRow({
          id: 'zhilian-publish-jd-old',
          platform: 'zhilian',
          siteFingerprint: 'site-old',
          version: 3,
          updatedAt: new Date('2026-07-07T08:00:00.000Z'),
        }),
        skillRow({
          id: 'other-workflow-v1',
          name: 'screen_candidates',
          version: 1,
          description: 'Screen candidates.',
        }),
        skillRow({
          id: 'failed-workflow-v1',
          name: 'failed_workflow',
          version: 1,
        }),
      ])
      .mockResolvedValueOnce([
        { id: 'zhilian-publish-jd-new', name: 'publish_jd', platform: 'zhilian' },
        { id: 'zhilian-publish-jd-old', name: 'publish_jd', platform: 'zhilian' },
        { id: 'zhilian-publish-jd-v0', name: 'publish_jd', platform: 'zhilian' },
        { id: 'other-workflow-v1', name: 'screen_candidates', platform: 'boss-like' },
        { id: 'failed-workflow-v1', name: 'failed_workflow', platform: 'boss-like' },
      ]);
    prismaMock.jobPublishTask.groupBy.mockResolvedValueOnce([
      { skillId: 'zhilian-publish-jd-new', status: 'success', _count: { _all: 2 } },
      { skillId: 'zhilian-publish-jd-old', status: 'success', _count: { _all: 2 } },
      { skillId: 'zhilian-publish-jd-old', status: 'failed', _count: { _all: 1 } },
      { skillId: 'failed-workflow-v1', status: 'failed', _count: { _all: 2 } },
    ]);
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValueOnce([
      { skillId: 'other-workflow-v1', status: 'success', _count: { _all: 3 } },
      { skillId: 'other-workflow-v1', status: 'failed', _count: { _all: 1 } },
    ]);

    const result = await listLatestActivePublishedWorkflows();

    expect(prismaMock.publishSkill.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { platform: 'asc' }, { updatedAt: 'desc' }, { version: 'desc' }],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'zhilian-publish-jd-new',
        name: 'publish_jd',
        platform: 'zhilian',
        version: 1,
        stepCount: 2,
        usageCount: 5,
        successRate: 1,
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ name: 'screen_candidates', usageCount: 4, successRate: 0.75 }),
    );
    expect(result.map((workflow) => workflow.name)).not.toContain('failed_workflow');
    expect(prismaMock.jobPublishTask.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['skillId', 'status'] }),
    );
  });

  it('lists an explored active workflow whose generated skill has not completed yet', async () => {
    prismaMock.publishSkill.findMany
      .mockResolvedValueOnce([skillRow({ id: 'untried-workflow-v1' })])
      .mockResolvedValueOnce([
        { id: 'untried-workflow-v1', name: 'publish_jd', platform: 'boss-like' },
      ]);
    prismaMock.jobPublishTask.groupBy.mockResolvedValueOnce([]);
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValueOnce([]);

    await expect(listLatestActivePublishedWorkflows()).resolves.toEqual([
      expect.objectContaining({
        id: 'untried-workflow-v1',
        usageCount: 0,
        successRate: null,
      }),
    ]);
  });

  it('hides a current active workflow with 0% success even when an older version succeeded', async () => {
    prismaMock.publishSkill.findMany
      .mockResolvedValueOnce([
        skillRow({
          id: 'current-workflow-v2',
          version: 2,
          updatedAt: new Date('2026-07-08T08:00:00.000Z'),
        }),
      ])
      .mockResolvedValueOnce([
        { id: 'current-workflow-v2', name: 'publish_jd', platform: 'boss-like' },
        { id: 'older-workflow-v1', name: 'publish_jd', platform: 'boss-like' },
      ]);
    prismaMock.jobPublishTask.groupBy.mockResolvedValueOnce([
      { skillId: 'current-workflow-v2', status: 'failed', _count: { _all: 2 } },
      { skillId: 'older-workflow-v1', status: 'success', _count: { _all: 8 } },
    ]);
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValueOnce([]);

    await expect(listLatestActivePublishedWorkflows()).resolves.toEqual([]);
  });

  it('lists an agent-generated repair separately from its older version usage', async () => {
    prismaMock.publishSkill.findMany
      .mockResolvedValueOnce([
        skillRow({
          id: 'repaired-workflow-v2',
          version: 2,
          updatedAt: new Date('2026-07-08T08:00:00.000Z'),
        }),
      ])
      .mockResolvedValueOnce([
        { id: 'repaired-workflow-v2', name: 'publish_jd', platform: 'boss-like' },
        { id: 'failed-workflow-v1', name: 'publish_jd', platform: 'boss-like' },
      ]);
    prismaMock.jobPublishTask.groupBy.mockResolvedValueOnce([
      { skillId: 'failed-workflow-v1', status: 'failed', _count: { _all: 3 } },
    ]);
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValueOnce([]);

    await expect(listLatestActivePublishedWorkflows()).resolves.toEqual([
      expect.objectContaining({
        id: 'repaired-workflow-v2',
        usageCount: 3,
        successRate: null,
      }),
    ]);
  });

  it('loads a workflow detail with historical versions for the same name and platform', async () => {
    prismaMock.publishSkill.findUnique.mockResolvedValueOnce(
      skillRow({ id: 'boss-like-publish-jd-v3', version: 3 }),
    );
    prismaMock.publishSkill.findMany.mockResolvedValueOnce([
      skillRow({ id: 'boss-like-publish-jd-v3', version: 3 }),
      skillRow({ id: 'boss-like-publish-jd-v2', version: 2, isActive: false }),
      skillRow({ id: 'boss-like-publish-jd-v1', version: 1, isActive: false }),
    ]);
    prismaMock.jobPublishTask.groupBy.mockResolvedValueOnce([
      { skillId: 'boss-like-publish-jd-v3', status: 'success', _count: { _all: 4 } },
      { skillId: 'boss-like-publish-jd-v3', status: 'failed', _count: { _all: 2 } },
      { skillId: 'boss-like-publish-jd-v2', status: 'success', _count: { _all: 4 } },
    ]);
    prismaMock.candidateScreeningRun.groupBy.mockResolvedValueOnce([]);

    const result = await getPublishedWorkflowDetail('boss-like-publish-jd-v3');

    expect(prismaMock.publishSkill.findUnique).toHaveBeenCalledWith({
      where: { id: 'boss-like-publish-jd-v3' },
    });
    expect(prismaMock.publishSkill.findMany).toHaveBeenCalledWith({
      where: { name: 'publish_jd', platform: 'boss-like', siteFingerprint: 'default' },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(result?.workflow.steps).toEqual(steps);
    expect(result?.workflow.usageCount).toBe(6);
    expect(result?.versions.map((version) => version.usageCount)).toEqual([6, 4, 0]);
    expect(result?.workflow.successRate).toBeCloseTo(2 / 3);
    expect(result?.versions.map((version) => version.successRate)).toEqual([2 / 3, 1, null]);
    expect(result?.versions.map((version) => version.version)).toEqual([3, 2, 1]);
  });
});
