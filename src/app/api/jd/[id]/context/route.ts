import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getJobDescriptionContext } from '@/lib/jd/context';

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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'job description id is required' }, { status: 400 });
    }

    const result = await getJobDescriptionContext(auth.user.id, id);
    if (!result) {
      return NextResponse.json({ error: 'job description context not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return serverErrorResponse(error);
  }
}
