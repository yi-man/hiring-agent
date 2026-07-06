import { QUALIFIED_CANDIDATE_SCORE } from '@/lib/candidate-screening/constants';
import { prisma } from '@/lib/prisma';
import type {
  JDScreeningRunStatus,
  JDScreeningStatus,
  JDScreeningSummary,
} from '@/types/jd-agent';

type RunRow = {
  id: string;
  jobDescriptionId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type CountRow = {
  jobDescriptionId: string;
  _count: {
    _all: number;
  };
};

export function getDefaultJdScreeningSummary(): JDScreeningSummary {
  return {
    status: 'not_started',
    totalCandidateCount: 0,
    qualifiedCandidateCount: 0,
    latestRunId: null,
    latestRunStatus: null,
    latestRunUpdatedAt: null,
  };
}

function toCountMap(rows: CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.jobDescriptionId, row._count._all]));
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function deriveStatus(params: {
  latestRunStatus: JDScreeningRunStatus | null;
  totalCandidateCount: number;
  qualifiedCandidateCount: number;
}): JDScreeningStatus {
  if (params.latestRunStatus === 'pending' || params.latestRunStatus === 'running') {
    return 'running';
  }

  if (params.latestRunStatus === 'failed' && params.qualifiedCandidateCount === 0) {
    return 'failed';
  }

  if (params.totalCandidateCount > 0 || params.latestRunStatus === 'success') {
    return 'screened';
  }

  return 'not_started';
}

function latestRunsByJd(rows: RunRow[]): Map<string, RunRow> {
  const latestByJd = new Map<string, RunRow>();
  for (const row of rows) {
    const current = latestByJd.get(row.jobDescriptionId);
    if (
      !current ||
      row.createdAt > current.createdAt ||
      (row.createdAt.getTime() === current.createdAt.getTime() && row.id > current.id)
    ) {
      latestByJd.set(row.jobDescriptionId, row);
    }
  }
  return latestByJd;
}

export async function listJdScreeningSummaries(params: {
  userId: string;
  jobDescriptionIds: string[];
}): Promise<Record<string, JDScreeningSummary>> {
  const jobDescriptionIds = Array.from(new Set(params.jobDescriptionIds.filter(Boolean)));
  if (jobDescriptionIds.length === 0) {
    return {};
  }

  const [runs, totalRows, qualifiedRows] = await Promise.all([
    prisma.candidateScreeningRun.findMany({
      where: {
        userId: params.userId,
        jobDescriptionId: { in: jobDescriptionIds },
      },
      select: {
        id: true,
        jobDescriptionId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.candidateScreeningResult.groupBy({
      by: ['jobDescriptionId'],
      where: {
        userId: params.userId,
        jobDescriptionId: { in: jobDescriptionIds },
      },
      _count: { _all: true },
    }),
    prisma.candidateScreeningResult.groupBy({
      by: ['jobDescriptionId'],
      where: {
        userId: params.userId,
        jobDescriptionId: { in: jobDescriptionIds },
        finalScore: { gte: QUALIFIED_CANDIDATE_SCORE },
      },
      _count: { _all: true },
    }),
  ]);

  const latestRunByJd = latestRunsByJd(runs as RunRow[]);
  const totalByJd = toCountMap(totalRows as CountRow[]);
  const qualifiedByJd = toCountMap(qualifiedRows as CountRow[]);

  return Object.fromEntries(
    jobDescriptionIds.map((jobDescriptionId) => {
      const latestRun = latestRunByJd.get(jobDescriptionId);
      const totalCandidateCount = totalByJd.get(jobDescriptionId) ?? 0;
      const qualifiedCandidateCount = qualifiedByJd.get(jobDescriptionId) ?? 0;
      const latestRunStatus = latestRun ? (latestRun.status as JDScreeningRunStatus) : null;

      return [
        jobDescriptionId,
        {
          status: deriveStatus({
            latestRunStatus,
            totalCandidateCount,
            qualifiedCandidateCount,
          }),
          totalCandidateCount,
          qualifiedCandidateCount,
          latestRunId: latestRun?.id ?? null,
          latestRunStatus,
          latestRunUpdatedAt: toIso(latestRun?.updatedAt ?? null),
        },
      ];
    }),
  );
}
