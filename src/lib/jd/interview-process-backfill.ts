import { Prisma } from '@prisma/client';
import { matchInterviewProcess } from '@/lib/interviews/process';
import type { InterviewProcess } from '@/lib/interviews/types';
import { prisma } from '@/lib/prisma';

export type JobDescriptionInterviewProcessBackfillClient = Pick<
  Prisma.TransactionClient,
  'jobDescription'
>;

export type JobDescriptionInterviewProcessBackfillResult = {
  scannedCount: number;
  matchedCount: number;
  updatedCount: number;
};

export async function backfillMissingJobDescriptionInterviewProcesses(params: {
  client?: JobDescriptionInterviewProcessBackfillClient;
  userId: string;
  interviewProcesses: readonly InterviewProcess[];
}): Promise<JobDescriptionInterviewProcessBackfillResult> {
  const client = params.client ?? prisma;
  const jobs = await client.jobDescription.findMany({
    where: { userId: params.userId, interviewProcess: { equals: Prisma.AnyNull } },
    select: {
      id: true,
      department: true,
      position: true,
      positionDescription: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let matchedCount = 0;
  let updatedCount = 0;
  for (const job of jobs) {
    const match = matchInterviewProcess(params.interviewProcesses, job);
    if (!match) continue;
    matchedCount += 1;

    const result = await client.jobDescription.updateMany({
      where: {
        id: job.id,
        userId: params.userId,
        interviewProcess: { equals: Prisma.AnyNull },
      },
      data: {
        interviewProcess: match.process as Prisma.InputJsonValue,
        updatedAt: job.updatedAt,
      },
    });
    updatedCount += result.count;
  }

  return { scannedCount: jobs.length, matchedCount, updatedCount };
}
