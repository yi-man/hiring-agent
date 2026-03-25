import type { EvaluationResult, JD } from '@/types';

export function needImprove(evalResult: EvaluationResult): boolean {
  return (
    evalResult.scores.clarity < 7 ||
    evalResult.scores.attractiveness < 7 ||
    evalResult.scores.specificity < 7
  );
}

function scoreTotal(evalResult: EvaluationResult): number {
  return (
    evalResult.scores.clarity +
    evalResult.scores.completeness +
    evalResult.scores.attractiveness +
    evalResult.scores.specificity
  );
}

export function pickBetter(
  originalJd: JD,
  improvedJd: JD,
  originalEval: EvaluationResult,
  improvedEval: EvaluationResult,
): { jd: JD; picked: 'original' | 'improved' } {
  const originalScore = scoreTotal(originalEval);
  const improvedScore = scoreTotal(improvedEval);

  if (improvedScore > originalScore) {
    return { jd: improvedJd, picked: 'improved' };
  }

  return { jd: originalJd, picked: 'original' };
}
