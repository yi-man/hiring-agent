import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getCandidateScreeningDetail } from '@/lib/candidate-screening/repo';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';

const DEFAULT_LOCAL_BOSS_LIKE_BASE_URL = 'http://localhost:6183';
const BOSS_LIKE_PROFILE_PATH_PREFIX = '/employer/resumes/';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function getBossLikeBaseUrl(): string | null {
  const configured = process.env.BOSS_LIKE_BASE_URL?.trim();
  if (configured) {
    return normalizeBaseUrl(configured);
  }
  return process.env.NODE_ENV === 'production' ? null : DEFAULT_LOCAL_BOSS_LIKE_BASE_URL;
}

function hasCandidateDetailPath(url: URL): boolean {
  return (
    url.pathname.startsWith(BOSS_LIKE_PROFILE_PATH_PREFIX) &&
    url.pathname.slice(BOSS_LIKE_PROFILE_PATH_PREFIX.length).length > 0
  );
}

function resolveBossLikeProfileUrl(profileUrl: string | null | undefined): URL | null {
  const trimmed = profileUrl?.trim();
  if (!trimmed) {
    return null;
  }

  const baseUrl = getBossLikeBaseUrl();
  try {
    const resolved = baseUrl ? new URL(trimmed, `${baseUrl}/`) : new URL(trimmed);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    if (!hasCandidateDetailPath(resolved)) {
      return null;
    }
    if (baseUrl && resolved.origin !== new URL(baseUrl).origin) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function resolveOriginalProfileUrl(params: {
  platform: CandidateScreeningPlatform;
  candidateProfileUrl: string | null;
  resumeProfileUrl: string | null;
}): URL | null {
  if (params.platform !== 'boss-like') {
    return null;
  }
  return (
    resolveBossLikeProfileUrl(params.candidateProfileUrl) ??
    resolveBossLikeProfileUrl(params.resumeProfileUrl)
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id, candidateId } = await context.params;
    if (!id?.trim()) {
      return badRequest('job description id is required');
    }
    if (!candidateId?.trim()) {
      return badRequest('candidate id is required');
    }

    const candidate = await getCandidateScreeningDetail({
      userId: auth.user.id,
      jobDescriptionId: id,
      candidateId,
    });
    if (!candidate) {
      return notFound('candidate screening result not found');
    }

    const originalProfileUrl = resolveOriginalProfileUrl({
      platform: candidate.candidate.sourcePlatform,
      candidateProfileUrl: candidate.candidate.profileUrl,
      resumeProfileUrl: candidate.resume?.profileUrl ?? null,
    });
    if (!originalProfileUrl) {
      return notFound('candidate original profile is unavailable');
    }

    return NextResponse.redirect(originalProfileUrl, { status: 302 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
