import { createHash } from 'node:crypto';
import type { CandidateScreeningPlatform } from './types';

type IdentityInput = {
  sourcePlatform: CandidateScreeningPlatform;
  platformCandidateId?: string | null;
  profileUrl?: string | null;
  name: string;
  company?: string | null;
  title?: string | null;
};

function clean(value?: string | null): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/$/, '');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createCandidateIdentity(input: IdentityInput): {
  identityKey: string;
  identityHash: string;
} {
  const platformId = clean(input.platformCandidateId);
  if (platformId) {
    const identityKey = `platform_id:${input.sourcePlatform}:${platformId}`;
    return { identityKey, identityHash: sha256(identityKey) };
  }

  const profileUrl = clean(input.profileUrl);
  if (profileUrl) {
    const identityKey = `profile_url:${input.sourcePlatform}:${normalizeUrl(profileUrl)}`;
    return { identityKey, identityHash: sha256(identityKey) };
  }

  const parts = [input.sourcePlatform, clean(input.name), clean(input.company), clean(input.title)]
    .map((part) => part.toLowerCase())
    .join('|');
  const identityKey = `fallback:${parts}`;
  return { identityKey, identityHash: sha256(identityKey) };
}

export function createInMemoryDedupeState(): {
  markSeen(identityHash: string): boolean;
} {
  const seen = new Set<string>();
  return {
    markSeen(identityHash: string) {
      if (seen.has(identityHash)) return false;
      seen.add(identityHash);
      return true;
    },
  };
}
