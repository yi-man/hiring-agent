import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import {
  parseCompanyProfilePayload,
  parseCompanyRecruitmentPlatformsPayload,
} from '@/lib/company-profile/api';
import {
  getCompanyProfileForUser,
  updateCompanyRecruitmentPlatformsForUser,
  upsertCompanyProfileForUser,
} from '@/lib/company-profile/repo';
import { listRecruitmentPlatformMetadata } from '@/lib/recruitment-platform-config';

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
    const [profile, platforms] = await Promise.all([
      getCompanyProfileForUser(auth.user.id),
      listRecruitmentPlatformMetadata(),
    ]);
    return NextResponse.json({ profile, platforms });
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

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth();
    const [current, platforms] = await Promise.all([
      getCompanyProfileForUser(auth.user.id),
      listRecruitmentPlatformMetadata(),
    ]);
    if (!current) {
      return NextResponse.json({ error: 'company profile not found' }, { status: 404 });
    }

    const parsed = parseCompanyRecruitmentPlatformsPayload(
      await request.json(),
      platforms.map((platform) => platform.id),
    );
    if (!parsed.ok) return badRequest(parsed.error);

    const profile = await updateCompanyRecruitmentPlatformsForUser({
      userId: auth.user.id,
      platformConfigs: parsed.value,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
