import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { StoredWorkflow, WorkflowStep } from '@/lib/workflow-learning/workflow-types';

function parseSteps(steps: unknown): WorkflowStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter((s): s is WorkflowStep => {
    if (!s || typeof s !== 'object') return false;
    const v = s as Partial<WorkflowStep>;
    return (
      typeof v.id === 'string' &&
      typeof v.tool === 'string' &&
      !!v.args &&
      typeof v.args === 'object' &&
      typeof v.description === 'string' &&
      typeof v.canBatch === 'boolean'
    );
  });
}

function toStoredWorkflow(row: {
  id: string;
  userId: string;
  name: string;
  goal: string;
  version: number;
  steps: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StoredWorkflow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    goal: row.goal,
    version: row.version,
    steps: parseSteps(row.steps),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createWorkflow(input: {
  userId: string;
  name: string;
  goal: string;
  steps: WorkflowStep[];
}): Promise<StoredWorkflow> {
  const row = await prisma.workflowLearningWorkflow.create({
    data: {
      userId: input.userId,
      name: input.name,
      goal: input.goal,
      steps: input.steps as Prisma.InputJsonValue,
      versions: {
        create: {
          version: 1,
          reason: 'initial',
          steps: input.steps as Prisma.InputJsonValue,
        },
      },
    },
  });
  return toStoredWorkflow(row);
}

export async function listWorkflows(userId: string): Promise<StoredWorkflow[]> {
  const rows = await prisma.workflowLearningWorkflow.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toStoredWorkflow);
}

export async function getWorkflowById(
  userId: string,
  workflowId: string,
): Promise<StoredWorkflow | null> {
  const row = await prisma.workflowLearningWorkflow.findFirst({
    where: { userId, id: workflowId },
  });
  return row ? toStoredWorkflow(row) : null;
}

export async function updateWorkflowSteps(input: {
  workflowId: string;
  userId: string;
  steps: WorkflowStep[];
  reason: string;
}): Promise<StoredWorkflow> {
  const current = await prisma.workflowLearningWorkflow.findFirst({
    where: { id: input.workflowId, userId: input.userId },
  });
  if (!current) throw new Error('Workflow not found');

  const nextVersion = current.version + 1;
  const updated = await prisma.workflowLearningWorkflow.update({
    where: { id: current.id },
    data: {
      version: nextVersion,
      steps: input.steps as Prisma.InputJsonValue,
      versions: {
        create: {
          version: nextVersion,
          reason: input.reason,
          steps: input.steps as Prisma.InputJsonValue,
        },
      },
    },
  });
  return toStoredWorkflow(updated);
}
