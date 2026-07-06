import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseCompanyProfilePayload } from '@/lib/company-profile/api';
import { getCompanyProfileForUser, upsertCompanyProfileForUser } from '@/lib/company-profile/repo';

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

  const message = error instanceof Error ? error.message : 'Unknown server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const auth = await requireAuth();
    const profile = await getCompanyProfileForUser(auth.user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    const parsed = parseCompanyProfilePayload(await request.json());
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const profile = await upsertCompanyProfileForUser({
      userId: auth.user.id,
      ...parsed.value,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
