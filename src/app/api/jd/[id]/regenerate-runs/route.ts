import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { createAndStartJobDescriptionRegenerateRun } from '@/lib/jd/regenerate-run-service';
import { getJobDescriptionById } from '@/lib/jd/job-description-repo';
import { parseRegenerateJobDescriptionPayload } from '@/lib/jd/api';
import {
  failStaleJobDescriptionRegenerateRuns,
  listJobDescriptionRegenerateRuns,
} from '@/lib/jd/regenerate-run-repo';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function serverErrorResponse(error: unknown) {
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

function parseLimit(value: string | null): number {
  const parsed = Number(value || '10');
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(50, Math.trunc(parsed)));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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

    const { searchParams } = new URL(request.url);
    await failStaleJobDescriptionRegenerateRuns({ userId: auth.user.id });
    const runs = await listJobDescriptionRegenerateRuns({
      userId: auth.user.id,
      jobDescriptionId: id,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ runs });
  } catch (error) {
    return serverErrorResponse(error);
  }
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
    if (current.status === 'published') {
      return conflict('published job descriptions cannot be modified');
    }

    const parsed = parseRegenerateJobDescriptionPayload(
      await request.json().catch(() => ({})),
      current.tone,
    );
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const currentJd = parsed.value.currentJd ?? current.content;
    const run = await createAndStartJobDescriptionRegenerateRun({
      userId: auth.user.id,
      jobDescriptionId: id,
      tone: parsed.value.tone,
      extraInstruction: parsed.value.extraInstruction ?? '',
      currentJd,
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
