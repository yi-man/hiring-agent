import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { getCandidateScreeningDetail } from '@/lib/candidate-screening/repo';
import type { CandidateScreeningPlatform } from '@/lib/candidate-screening/types';
import { resolveRecruitmentPlatformRuntimeConfig } from '@/lib/recruitment-platform-config';
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

function hasCandidateDetailPath(url: URL): boolean {
  return (
    url.pathname.startsWith(BOSS_LIKE_PROFILE_PATH_PREFIX) &&
    url.pathname.slice(BOSS_LIKE_PROFILE_PATH_PREFIX.length).length > 0
  );
}

function resolveBossLikeProfileUrl(
  profileUrl: string | null | undefined,
  baseUrl: string,
): URL | null {
  const trimmed = profileUrl?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const resolved = new URL(trimmed, `${normalizeBaseUrl(baseUrl)}/`);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    if (!hasCandidateDetailPath(resolved)) {
      return null;
    }
    if (resolved.origin !== new URL(baseUrl).origin) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function resolveOriginalProfileUrl(params: {
  baseUrl: string;
  siteTemplatePlatform: CandidateScreeningPlatform;
  candidateProfileUrl: string | null;
  resumeProfileUrl: string | null;
}): URL | null {
  if (params.siteTemplatePlatform === 'boss-like') {
    return (
      resolveBossLikeProfileUrl(params.candidateProfileUrl, params.baseUrl) ??
      resolveBossLikeProfileUrl(params.resumeProfileUrl, params.baseUrl)
    );
  }
  const candidateUrl = params.candidateProfileUrl?.trim() || params.resumeProfileUrl?.trim();
  if (!candidateUrl) return null;
  try {
    const resolved = new URL(candidateUrl, `${normalizeBaseUrl(params.baseUrl)}/`);
    const expected = new URL(params.baseUrl);
    if (!/^https?:$/.test(resolved.protocol) || resolved.origin !== expected.origin) return null;
    return resolved.pathname === '/' ? null : resolved;
  } catch {
    return null;
  }
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

    const platformConfig = await resolveRecruitmentPlatformRuntimeConfig({
      userId: auth.user.id,
      platform: candidate.candidate.sourcePlatform,
    });
    const originalProfileUrl = resolveOriginalProfileUrl({
      baseUrl: platformConfig.baseUrl,
      siteTemplatePlatform: platformConfig.siteTemplatePlatform,
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
