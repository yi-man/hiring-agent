import type { CandidateScreeningSource } from './types';

export type RankInput = {
  candidateId: string;
  matchScore: number;
};

export type RankedCandidate = {
  candidateId: string;
  matchScore: number;
  source: CandidateScreeningSource;
  rank: number;
};

type CandidateAccumulator = {
  candidateId: string;
  liveScore?: number;
  vectorScore?: number;
};

function addCandidate(
  candidates: Map<string, CandidateAccumulator>,
  input: RankInput,
  source: 'liveScore' | 'vectorScore',
): void {
  const current = candidates.get(input.candidateId) ?? { candidateId: input.candidateId };
  current[source] = Math.max(current[source] ?? Number.NEGATIVE_INFINITY, input.matchScore);
  candidates.set(input.candidateId, current);
}

function resolveSource(candidate: CandidateAccumulator): CandidateScreeningSource {
  if (candidate.liveScore !== undefined && candidate.vectorScore !== undefined) return 'both';
  return candidate.liveScore !== undefined ? 'live_search' : 'vector_recall';
}

function resolveScore(candidate: CandidateAccumulator): number {
  return Math.max(
    candidate.liveScore ?? Number.NEGATIVE_INFINITY,
    candidate.vectorScore ?? Number.NEGATIVE_INFINITY,
  );
}

export function mergeAndRankCandidates(params: {
  live: RankInput[];
  vector: RankInput[];
}): RankedCandidate[] {
  const candidates = new Map<string, CandidateAccumulator>();

  params.live.forEach((candidate) => addCandidate(candidates, candidate, 'liveScore'));
  params.vector.forEach((candidate) => addCandidate(candidates, candidate, 'vectorScore'));

  return Array.from(candidates.values())
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      matchScore: resolveScore(candidate),
      source: resolveSource(candidate),
      rank: 0,
    }))
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore || left.candidateId.localeCompare(right.candidateId),
    )
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}
