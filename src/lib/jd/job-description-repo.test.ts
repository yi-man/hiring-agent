import {
  createJobDescription,
  getJobDescriptionById,
  listJobDescriptionsPaginated,
  updateJobDescription,
} from '@/lib/jd/job-description-repo';
import type { JD, JDAgentResponse } from '@/types';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    jobDescription: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    jobDescription: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
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
  tone: 'tech',
  status: 'created',
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
  });

  it('creates a user-owned JD record and maps json content', async () => {
    prismaMock.jobDescription.create.mockResolvedValueOnce(row);

    const result = await createJobDescription({
      userId: 'u1',
      department: '技术部',
      position: '前端工程师',
      positionDescription: '负责增长业务体验建设',
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
      updatedAt: '2026-06-25T02:00:00.000Z',
    });
  });

  it('lists only the current user JDs ordered by latest update', async () => {
    prismaMock.jobDescription.findMany.mockResolvedValueOnce([row]);

    const result = await listJobDescriptionsPaginated({ userId: 'u1', limit: 20, offset: 0 });

    expect(prismaMock.jobDescription.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { updatedAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.position).toBe('前端工程师');
  });

  it('gets a JD by id with user ownership', async () => {
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce(row);

    const result = await getJobDescriptionById('u1', 'jd-1');

    expect(prismaMock.jobDescription.findFirst).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1' },
    });
    expect(result?.id).toBe('jd-1');
  });

  it('updates a JD only when it belongs to the current user', async () => {
    prismaMock.jobDescription.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.jobDescription.findFirst.mockResolvedValueOnce({
      ...row,
      status: 'ready_to_publish',
      content: { ...sampleJd, summary: '手动调整后的 JD' },
    });

    const result = await updateJobDescription({
      userId: 'u1',
      id: 'jd-1',
      status: 'ready_to_publish',
      content: { ...sampleJd, summary: '手动调整后的 JD' },
    });

    expect(prismaMock.jobDescription.updateMany).toHaveBeenCalledWith({
      where: { id: 'jd-1', userId: 'u1' },
      data: expect.objectContaining({
        status: 'ready_to_publish',
        content: { ...sampleJd, summary: '手动调整后的 JD' },
      }),
    });
    expect(result?.status).toBe('ready_to_publish');
    expect(result?.content.summary).toBe('手动调整后的 JD');
  });
});
