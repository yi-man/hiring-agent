import { prisma } from '@/lib/prisma';

export type WorkflowExecutionStats = {
  usageCount: number;
  completedCount: number;
  successCount: number;
};

type WorkflowExecutionCountRow = {
  skillId: string | null;
  status: string;
  _count: { _all: number };
};

export function successRateForWorkflowStats(stats?: WorkflowExecutionStats): number | null {
  return stats && stats.completedCount > 0 ? stats.successCount / stats.completedCount : null;
}

export function isEffectiveWorkflowVersion(stats?: WorkflowExecutionStats): boolean {
  return successRateForWorkflowStats(stats) !== 0;
}

export function addWorkflowExecutionStats(
  target: WorkflowExecutionStats,
  source: WorkflowExecutionStats,
): void {
  target.usageCount += source.usageCount;
  target.completedCount += source.completedCount;
  target.successCount += source.successCount;
}

export async function getWorkflowExecutionStatsBySkillId(
  skillIds: string[],
): Promise<Map<string, WorkflowExecutionStats>> {
  if (skillIds.length === 0) return new Map();

  const [publishTaskCounts, screeningRunCounts] = await Promise.all([
    prisma.jobPublishTask.groupBy({
      by: ['skillId', 'status'],
      where: { skillId: { in: skillIds } },
      _count: { _all: true },
    }),
    prisma.candidateScreeningRun.groupBy({
      by: ['skillId', 'status'],
      where: { skillId: { in: skillIds } },
      _count: { _all: true },
    }),
  ]);

  const result = new Map<string, WorkflowExecutionStats>();
  for (const row of [...publishTaskCounts, ...screeningRunCounts] as WorkflowExecutionCountRow[]) {
    if (!row.skillId) continue;
    const count = row._count._all;
    const stats = result.get(row.skillId) ?? {
      usageCount: 0,
      completedCount: 0,
      successCount: 0,
    };
    stats.usageCount += count;
    if (row.status === 'success' || row.status === 'failed') {
      stats.completedCount += count;
    }
    if (row.status === 'success') {
      stats.successCount += count;
    }
    result.set(row.skillId, stats);
  }
  return result;
}
