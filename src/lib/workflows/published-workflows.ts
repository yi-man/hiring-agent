import { prisma } from '@/lib/prisma';
import type { PublishPlatform, PublishSkillMeta, PublishStep } from '@/lib/jd-publishing/types';
import {
  addWorkflowExecutionStats,
  getWorkflowExecutionStatsBySkillId,
  successRateForWorkflowStats,
  type WorkflowExecutionStats,
} from './execution-stats';

type PublishSkillRecord = {
  id: string;
  name: string;
  platform: string;
  siteFingerprint: string;
  description: string;
  version: number;
  isActive: boolean;
  inputSchema: unknown;
  variables: unknown;
  steps: unknown;
  meta: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublishedWorkflowSummary = {
  id: string;
  name: string;
  platform: PublishPlatform;
  siteFingerprint: string;
  description: string;
  version: number;
  isActive: boolean;
  stepCount: number;
  usageCount: number;
  successRate: number | null;
  meta?: PublishSkillMeta;
  createdAt: string;
  updatedAt: string;
};

export type PublishedWorkflow = PublishedWorkflowSummary & {
  inputSchema: Record<string, unknown>;
  variables: Record<string, unknown>;
  steps: PublishStep[];
};

export type PublishedWorkflowDetail = {
  workflow: PublishedWorkflow;
  versions: PublishedWorkflowSummary[];
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toSkillMeta(value: unknown): PublishSkillMeta | undefined {
  const record = toRecord(value);
  return Object.keys(record).length > 0 ? (record as PublishSkillMeta) : undefined;
}

function toSteps(value: unknown): PublishStep[] {
  return Array.isArray(value) ? (value as PublishStep[]) : [];
}

function mapSummary(
  row: PublishSkillRecord,
  stats?: WorkflowExecutionStats,
): PublishedWorkflowSummary {
  const steps = toSteps(row.steps);

  return {
    id: row.id,
    name: row.name,
    platform: row.platform as PublishPlatform,
    siteFingerprint: row.siteFingerprint,
    description: row.description,
    version: row.version,
    isActive: row.isActive,
    stepCount: steps.length,
    usageCount: stats?.usageCount ?? 0,
    successRate: successRateForWorkflowStats(stats),
    meta: toSkillMeta(row.meta),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWorkflow(row: PublishSkillRecord, stats?: WorkflowExecutionStats): PublishedWorkflow {
  return {
    ...mapSummary(row, stats),
    inputSchema: toRecord(row.inputSchema),
    variables: toRecord(row.variables),
    steps: toSteps(row.steps),
  };
}

function workflowKey(workflow: Pick<PublishedWorkflowSummary, 'name' | 'platform'>): string {
  return `${workflow.platform}:${workflow.name}`;
}

export async function listLatestActivePublishedWorkflows(): Promise<PublishedWorkflowSummary[]> {
  const rows = await prisma.publishSkill.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { platform: 'asc' }, { updatedAt: 'desc' }, { version: 'desc' }],
  });

  const seen = new Set<string>();
  const workflows: PublishedWorkflowSummary[] = [];

  for (const row of rows) {
    const workflow = mapSummary(row);
    const key = workflowKey(workflow);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    workflows.push(workflow);
  }

  if (workflows.length === 0) return [];

  const workflowIdentities = await prisma.publishSkill.findMany({
    where: {
      OR: workflows.map((workflow) => ({
        name: workflow.name,
        platform: workflow.platform,
      })),
    },
    select: { id: true, name: true, platform: true },
  });
  const statsBySkillId = await getWorkflowExecutionStatsBySkillId(
    workflowIdentities.map((workflow) => workflow.id),
  );
  const statsByWorkflow = new Map<string, WorkflowExecutionStats>();

  for (const identity of workflowIdentities) {
    const key = workflowKey({
      name: identity.name,
      platform: identity.platform as PublishPlatform,
    });
    const stats = statsByWorkflow.get(key) ?? {
      usageCount: 0,
      completedCount: 0,
      successCount: 0,
    };
    const identityStats = statsBySkillId.get(identity.id);
    if (identityStats) addWorkflowExecutionStats(stats, identityStats);
    statsByWorkflow.set(key, stats);
  }

  return workflows.flatMap((workflow) => {
    const aggregateStats = statsByWorkflow.get(workflowKey(workflow));
    const currentStats = statsBySkillId.get(workflow.id);
    const summary = {
      ...workflow,
      usageCount: aggregateStats?.usageCount ?? 0,
      successRate: successRateForWorkflowStats(currentStats),
    };
    return summary.successRate === 0 ? [] : [summary];
  });
}

export async function getPublishedWorkflowDetail(
  id: string,
): Promise<PublishedWorkflowDetail | null> {
  const row = await prisma.publishSkill.findUnique({
    where: { id },
  });

  if (!row) {
    return null;
  }

  const versions = await prisma.publishSkill.findMany({
    where: {
      name: row.name,
      platform: row.platform,
      siteFingerprint: row.siteFingerprint,
    },
    orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
  });

  const statsBySkillId = await getWorkflowExecutionStatsBySkillId(
    versions.map((version) => version.id),
  );

  return {
    workflow: mapWorkflow(row, statsBySkillId.get(row.id)),
    versions: versions.map((version) => mapSummary(version, statsBySkillId.get(version.id))),
  };
}
