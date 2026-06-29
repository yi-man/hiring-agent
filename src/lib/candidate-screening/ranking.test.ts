import { mergeAndRankCandidates } from './ranking';

describe('candidate ranking', () => {
  it('merges live and vector candidates by candidate id and marks both sources', () => {
    const rows = mergeAndRankCandidates({
      live: [
        { candidateId: 'c1', matchScore: 80 },
        { candidateId: 'c2', matchScore: 75 },
      ],
      vector: [
        { candidateId: 'c1', matchScore: 90 },
        { candidateId: 'c3', matchScore: 70 },
      ],
    });

    expect(rows.map((row) => row.candidateId)).toEqual(['c1', 'c2', 'c3']);
    expect(rows[0]).toMatchObject({ source: 'both', rank: 1 });
  });
});
