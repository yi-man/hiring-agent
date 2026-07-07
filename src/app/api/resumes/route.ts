import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { listCandidateResumeLibrary } from '@/lib/candidate-screening/repo';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(value: string | null): number {
  if (value === null || value.trim() === '') return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const resumes = await listCandidateResumeLibrary({
      userId: auth.user.id,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ resumes });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
