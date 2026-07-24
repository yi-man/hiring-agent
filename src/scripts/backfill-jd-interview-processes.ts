import { Prisma } from '@prisma/client';
import { getCompanyInterviewProcessesForUser } from '@/lib/company-profile/repo';
import { backfillMissingJobDescriptionInterviewProcesses } from '@/lib/jd/interview-process-backfill';
import { closePrismaClient, prisma } from '@/lib/prisma';

async function main(): Promise<void> {
  const target = process.argv[2]?.trim();
  if (!target) {
    throw new Error('usage: bun run jd:backfill-interview-processes -- <username|--all>');
  }

  const users =
    target === '--all'
      ? await prisma.user.findMany({
          where: {
            jobDescriptions: {
              some: { interviewProcess: { equals: Prisma.AnyNull } },
            },
          },
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        })
      : await prisma.user
          .findUnique({ where: { username: target }, select: { id: true, username: true } })
          .then((user) => (user ? [user] : []));

  if (users.length === 0) {
    throw new Error(target === '--all' ? 'no historical JDs need backfilling' : 'user not found');
  }

  for (const user of users) {
    const interviewProcesses = await getCompanyInterviewProcessesForUser(user.id);
    const result = await backfillMissingJobDescriptionInterviewProcesses({
      userId: user.id,
      interviewProcesses,
    });
    console.log(
      `[jd-interview-process-backfill] ${user.username}: scanned=${result.scannedCount} matched=${result.matchedCount} updated=${result.updatedCount}`,
    );
  }
}

void main()
  .catch((error) => {
    console.error(
      `[jd-interview-process-backfill] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(closePrismaClient);
