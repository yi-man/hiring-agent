import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { JDAgentContextRetrievalError, runJDAgent } from '@/lib/jd-agent/service';
import {
  countJobDescriptions,
  createJobDescription,
  listJobDescriptionsPaginated,
} from '@/lib/jd/job-description-repo';
import {
  getDefaultJdScreeningSummary,
  listJdScreeningSummaries,
} from '@/lib/jd/screening-summary';
import { composeJDJobInput, isJDStatus, parseCreateJobDescriptionPayload } from '@/lib/jd/api';

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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '20')));
    const statusParam = searchParams.get('status');
    if (statusParam && !isJDStatus(statusParam)) {
      return badRequest('status is invalid');
    }
    const status = statusParam && isJDStatus(statusParam) ? statusParam : undefined;
    const offset = (page - 1) * limit;
    const [jobDescriptions, total] = await Promise.all([
      listJobDescriptionsPaginated({ userId: auth.user.id, limit, offset, status }),
      countJobDescriptions(auth.user.id, status),
    ]);
    const summaries = await listJdScreeningSummaries({
      userId: auth.user.id,
      jobDescriptionIds: jobDescriptions.map((item) => item.id),
    });

    return NextResponse.json({
      jobDescriptions: jobDescriptions.map((item) => ({
        ...item,
        screeningSummary: summaries[item.id] ?? getDefaultJdScreeningSummary(),
      })),
      total,
      page,
      limit,
      hasMore: offset + jobDescriptions.length < total,
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = parseCreateJobDescriptionPayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }
    const value = parsed.value;

    const agentResponse = await runJDAgent(
      {
        action: 'initial_generate',
        jobInput: composeJDJobInput(value),
        tone: value.tone,
      },
      { userId: auth.user.id },
    );

    const jobDescription = await createJobDescription({
      userId: auth.user.id,
      department: value.department,
      position: value.position,
      positionDescription: value.positionDescription,
      salaryRange: value.salaryRange,
      workLocations: value.workLocations,
      tone: value.tone,
      content: agentResponse.jd,
      evaluation: agentResponse.evaluation,
      generationMeta: agentResponse.meta,
    });

    return NextResponse.json({ jobDescription }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
