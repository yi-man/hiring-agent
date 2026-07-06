import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getDashboardOverview, parseDashboardFilters } from '@/lib/dashboard/overview';

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function errorResponse(error: unknown) {
  const status = errorStatus(error);
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError') ||
    status === 401
  ) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: status ?? 401 },
    );
  }

  const message = error instanceof Error ? error.message : 'Unknown server error';
  if (message === 'status is invalid' || message === 'platform is invalid') {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const filters = parseDashboardFilters(searchParams);
    const overview = await getDashboardOverview({
      userId: auth.user.id,
      filters,
    });

    return NextResponse.json(overview);
  } catch (error) {
    return errorResponse(error);
  }
}
