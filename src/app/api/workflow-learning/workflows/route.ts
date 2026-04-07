import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { createWorkflow, listWorkflows } from '@/lib/workflow-learning/workflow-store';

const workflowStepSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  description: z.string().min(1),
  canBatch: z.boolean(),
  successCondition: z.string().optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1),
});

export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireAuth();
    const workflows = await listWorkflows(auth.user.id);
    return NextResponse.json({ workflows });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const messageText = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = (await request.json()) as unknown;
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'name, goal and valid steps are required' },
        { status: 400 },
      );
    }

    const workflow = await createWorkflow({
      userId: auth.user.id,
      name: parsed.data.name.trim(),
      goal: parsed.data.goal.trim(),
      steps: parsed.data.steps,
    });
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const messageText = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
