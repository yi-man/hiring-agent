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
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    publishSkill: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
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
  });

  it('lists only the latest active workflow per name and platform', async () => {
    prismaMock.publishSkill.findMany.mockResolvedValueOnce([
      skillRow({ id: 'boss-like-publish-jd-v3', version: 3 }),
      skillRow({ id: 'boss-like-publish-jd-v2', version: 2 }),
      skillRow({
        id: 'other-workflow-v1',
        name: 'screen_candidates',
        version: 1,
        description: 'Screen candidates.',
      }),
    ]);

    const result = await listLatestActivePublishedWorkflows();

    expect(prismaMock.publishSkill.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { platform: 'asc' }, { version: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'boss-like-publish-jd-v3',
        name: 'publish_jd',
        platform: 'boss-like',
        version: 3,
        stepCount: 2,
        updatedAt: now.toISOString(),
      }),
    );
    expect(result[1]?.name).toBe('screen_candidates');
  });

  it('loads a workflow detail with historical versions for the same name and platform', async () => {
    prismaMock.publishSkill.findUnique.mockResolvedValueOnce(skillRow({ version: 3 }));
    prismaMock.publishSkill.findMany.mockResolvedValueOnce([
      skillRow({ id: 'boss-like-publish-jd-v3', version: 3 }),
      skillRow({ id: 'boss-like-publish-jd-v2', version: 2, isActive: false }),
      skillRow({ id: 'boss-like-publish-jd-v1', version: 1, isActive: false }),
    ]);

    const result = await getPublishedWorkflowDetail('boss-like-publish-jd-v3');

    expect(prismaMock.publishSkill.findUnique).toHaveBeenCalledWith({
      where: { id: 'boss-like-publish-jd-v3' },
    });
    expect(prismaMock.publishSkill.findMany).toHaveBeenCalledWith({
      where: { name: 'publish_jd', platform: 'boss-like' },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    expect(result?.workflow.steps).toEqual(steps);
    expect(result?.versions.map((version) => version.version)).toEqual([3, 2, 1]);
  });
});
