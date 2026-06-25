import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { JDAgentContextRetrievalError, runJDAgent } from '@/lib/jd-agent/service';
import { getJobDescriptionById, updateJobDescription } from '@/lib/jd/job-description-repo';
import { parseRegenerateJobDescriptionPayload } from '@/lib/jd/api';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverErrorResponse(error: unknown) {
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError')
  ) {
    const status = error instanceof UnauthorizedError ? error.status : 401;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (
    error instanceof JDAgentContextRetrievalError ||
    (error instanceof Error && error.name === 'JDAgentContextRetrievalError')
  ) {
    return NextResponse.json(
      {
        code: 'JD_CONTEXT_RETRIEVAL_FAILED',
        error: error instanceof Error ? error.message : '公司上下文检索失败',
      },
      { status: 502 },
    );
  }
  const message = error instanceof Error ? error.message : 'Unknown server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }

    const current = await getJobDescriptionById(auth.user.id, id);
    if (!current) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    const parsed = parseRegenerateJobDescriptionPayload(
      await request.json().catch(() => ({})),
      current.tone,
    );
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }
    const value = parsed.value;

    const agentResponse = await runJDAgent(
      {
        action: 'continue_generate',
        currentJd: current.content,
        extraInstruction: value.extraInstruction,
        tone: value.tone,
      },
      { userId: auth.user.id },
    );

    const jobDescription = await updateJobDescription({
      userId: auth.user.id,
      id,
      tone: value.tone,
      status: 'created',
      content: agentResponse.jd,
      evaluation: agentResponse.evaluation,
      generationMeta: agentResponse.meta,
    });
    if (!jobDescription) {
      return NextResponse.json({ error: 'job description not found' }, { status: 404 });
    }

    return NextResponse.json({ jobDescription });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
