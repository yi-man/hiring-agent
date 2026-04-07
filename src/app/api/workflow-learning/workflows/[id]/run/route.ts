import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { executeWorkflowWithRecovery } from '@/lib/workflow-learning/workflow-runner';
import { getWorkflowById } from '@/lib/workflow-learning/workflow-store';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const params = await context.params;
    const workflow = await getWorkflowById(auth.user.id, params.id);
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const result = await executeWorkflowWithRecovery({
      userId: auth.user.id,
      workflow,
    });
    return NextResponse.json({ result });
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
