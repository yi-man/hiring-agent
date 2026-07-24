import { Prisma } from '@prisma/client';
import { DEFAULT_INTERVIEW_PROCESSES } from '@/lib/interviews/defaults';
import {
  backfillMissingJobDescriptionInterviewProcesses,
  type JobDescriptionInterviewProcessBackfillClient,
} from './interview-process-backfill';

describe('job description interview process backfill', () => {
  it('matches and persists snapshots only for JDs without a process', async () => {
    const originalUpdatedAt = new Date('2026-07-01T08:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'jd-technical',
        department: '技术部',
        position: '后端工程师',
        positionDescription: '负责核心服务开发',
        updatedAt: originalUpdatedAt,
      },
      {
        id: 'jd-administration',
        department: '人力行政部',
        position: '行政专员',
        positionDescription: '负责办公室行政支持',
        updatedAt: originalUpdatedAt,
      },
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const client = { jobDescription: { findMany, updateMany } };

    const result = await backfillMissingJobDescriptionInterviewProcesses({
      client: client as unknown as JobDescriptionInterviewProcessBackfillClient,
      userId: 'u1',
      interviewProcesses: DEFAULT_INTERVIEW_PROCESSES,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', interviewProcess: { equals: Prisma.AnyNull } },
      select: {
        id: true,
        department: true,
        position: true,
        positionDescription: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'jd-technical',
        userId: 'u1',
        interviewProcess: { equals: Prisma.AnyNull },
      },
      data: {
        interviewProcess: expect.objectContaining({ id: 'default-technical' }),
        updatedAt: originalUpdatedAt,
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'jd-administration',
        userId: 'u1',
        interviewProcess: { equals: Prisma.AnyNull },
      },
      data: {
        interviewProcess: expect.objectContaining({ id: 'default-administration' }),
        updatedAt: originalUpdatedAt,
      },
    });
    expect(result).toEqual({ scannedCount: 2, matchedCount: 2, updatedCount: 2 });
  });

  it('is idempotent when every JD already has a process snapshot', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const updateMany = jest.fn();

    await expect(
      backfillMissingJobDescriptionInterviewProcesses({
        client: {
          jobDescription: { findMany, updateMany },
        } as unknown as JobDescriptionInterviewProcessBackfillClient,
        userId: 'u1',
        interviewProcesses: DEFAULT_INTERVIEW_PROCESSES,
      }),
    ).resolves.toEqual({ scannedCount: 0, matchedCount: 0, updatedCount: 0 });

    expect(updateMany).not.toHaveBeenCalled();
  });
});
