import { prisma } from '@/lib/prisma';
import type { PublishPlatform, PublishSkillMeta, PublishStep } from '@/lib/jd-publishing/types';

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

function mapSummary(row: PublishSkillRecord): PublishedWorkflowSummary {
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
    meta: toSkillMeta(row.meta),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWorkflow(row: PublishSkillRecord): PublishedWorkflow {
  return {
    ...mapSummary(row),
    inputSchema: toRecord(row.inputSchema),
    variables: toRecord(row.variables),
    steps: toSteps(row.steps),
  };
}

function workflowKey(
  workflow: Pick<PublishedWorkflowSummary, 'name' | 'platform' | 'siteFingerprint'>,
): string {
  return `${workflow.platform}:${workflow.siteFingerprint}:${workflow.name}`;
}

export async function listLatestActivePublishedWorkflows(): Promise<PublishedWorkflowSummary[]> {
  const rows = await prisma.publishSkill.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { platform: 'asc' }, { version: 'desc' }, { updatedAt: 'desc' }],
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

  return workflows;
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

  return {
    workflow: mapWorkflow(row),
    versions: versions.map(mapSummary),
  };
}
