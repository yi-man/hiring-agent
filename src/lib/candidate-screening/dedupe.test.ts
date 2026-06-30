import { createCandidateIdentity, createInMemoryDedupeState } from './dedupe';

describe('candidate dedupe', () => {
  it('prefers platform id over URL and fallback fields', () => {
    const identity = createCandidateIdentity({
      sourcePlatform: 'boss-like',
      platformCandidateId: 'boss-123',
      profileUrl: 'https://example.com/c/abc',
      name: '王小明',
      company: '星河智能',
      title: '后端工程师',
    });

    expect(identity.identityKey).toBe('platform_id:boss-like:boss-123');
    expect(identity.identityHash).toHaveLength(64);
  });

  it('uses normalized profile URL when platform id is missing', () => {
    const identity = createCandidateIdentity({
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.com/c/abc?from=list',
      name: '王小明',
      company: '星河智能',
      title: '后端工程师',
    });

    expect(identity.identityKey).toBe('profile_url:boss-like:https://example.com/c/abc');
  });

  it('tracks duplicates inside one run', () => {
    const state = createInMemoryDedupeState();
    expect(state.markSeen('hash-1')).toBe(true);
    expect(state.markSeen('hash-1')).toBe(false);
  });
});
