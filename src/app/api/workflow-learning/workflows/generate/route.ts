import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import { runWorkflowAgentWithEvents } from '@/lib/workflow-learning/agent-runner';
import { solidifyWorkflowFromEvents } from '@/lib/workflow-learning/workflow-solidifier';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json()) as { goal?: string };
    const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
    if (!goal) {
      return NextResponse.json({ error: 'goal is required' }, { status: 400 });
    }

    const runId = randomUUID();
    const events = [];
    for await (const ev of runWorkflowAgentWithEvents({ runId, userText: goal })) {
      events.push(ev);
    }
    const steps = await solidifyWorkflowFromEvents(goal, events);
    return NextResponse.json({ runId, goal, steps, events });
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
