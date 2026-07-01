import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseUnreadSyncPayload } from '@/lib/candidate-communication/api';
import { runUnreadCandidateCommunicationSkill } from '@/lib/candidate-communication/skill-service';

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

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: 'invalid JSON body' };
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await readJsonBody(request);
    if (!body.ok) {
      return badRequest(body.error);
    }

    const parsed = parseUnreadSyncPayload(body.value);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }

    const result = await runUnreadCandidateCommunicationSkill({
      userId: auth.user.id,
      jobDescriptionId: parsed.value.jobDescriptionId,
      platform: parsed.value.platform,
      maxPasses: parsed.value.maxPasses,
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
