import { needImprove, pickBetter } from '@/lib/jd-agent/decision';
import type { EvaluationResult, JD } from '@/types';

const jdA: JD = {
  title: 'A',
  summary: 'A',
  responsibilities: ['a'],
  requirements: ['a'],
  bonus: [],
  highlights: ['a'],
};

const jdB: JD = {
  ...jdA,
  title: 'B',
};

function evalWith(scores: EvaluationResult['scores']): EvaluationResult {
  return {
    scores,
    issues: [],
    evidence: [],
    suggestions: [],
    rewrite_required: false,
  };
}

describe('jd-agent decision', () => {
  it('triggers improve when clarity is below threshold', () => {
    expect(
      needImprove(evalWith({ clarity: 6, completeness: 9, attractiveness: 9, specificity: 9 })),
    ).toBe(true);
  });

  it('selects improved jd when score is higher', () => {
    const chosen = pickBetter(
      jdA,
      jdB,
      evalWith({ clarity: 7, completeness: 7, attractiveness: 7, specificity: 7 }),
      evalWith({ clarity: 8, completeness: 8, attractiveness: 8, specificity: 8 }),
    );
    expect(chosen.picked).toBe('improved');
    expect(chosen.jd.title).toBe('B');
  });
});
