import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getRun, markRunStatus, setRunApprovalToken } from '@/lib/chat/patterns/run-store';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    const body = (await request.json()) as {
      runId?: string;
      approvalToken?: string;
      approved?: boolean;
    };
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: auth.user.id,
      },
      select: {
        id: true,
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
    }
    const runId = body.runId?.trim();
    const approvalToken = body.approvalToken?.trim();
    if (!runId || !approvalToken) {
      return NextResponse.json({ error: 'runId and approvalToken are required' }, { status: 400 });
    }
    const run = getRun(runId);
    if (!run || run.conversationId !== id) {
      return NextResponse.json({ error: 'run not found' }, { status: 404 });
    }
    if (run.pendingApprovalToken !== approvalToken) {
      return NextResponse.json({ error: 'invalid approval token' }, { status: 400 });
    }
    if (!body.approved) {
      markRunStatus(runId, 'failed');
      setRunApprovalToken(runId, undefined);
      return NextResponse.json({ ok: true, approved: false });
    }
    markRunStatus(runId, 'running');
    return NextResponse.json({ ok: true, approved: true });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
