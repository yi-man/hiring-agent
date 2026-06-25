import { NextResponse } from 'next/server';
import type { JDAgentRequest } from '@/types';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { JDAgentContextRetrievalError, runJDAgent } from '@/lib/jd-agent/service';

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = (await request.json()) as JDAgentRequest;

    if (!body?.action) {
      return badRequest('action is required');
    }

    if (body.action === 'initial_generate' && !body.jobInput?.trim()) {
      return badRequest('jobInput is required for initial_generate');
    }

    if (body.action === 'continue_generate' && !body.currentJd) {
      return badRequest('currentJd is required for continue_generate');
    }

    const data = await runJDAgent(body, { userId: auth.user.id });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ success: false, message: error.message }, { status });
    }
    if (
      error instanceof JDAgentContextRetrievalError ||
      (error instanceof Error && error.name === 'JDAgentContextRetrievalError')
    ) {
      return NextResponse.json(
        {
          success: false,
          code: 'JD_CONTEXT_RETRIEVAL_FAILED',
          message: error instanceof Error ? error.message : '公司上下文检索失败',
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
