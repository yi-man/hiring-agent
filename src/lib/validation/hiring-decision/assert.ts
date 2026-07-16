import type { CandidateDecisionResultDto } from '@/lib/candidate-screening/hiring-decision';
import type { HiringDecisionGoldenSample } from './dataset';

export type HiringDecisionAssertFailure = { field: string; message: string };
export type HiringDecisionAssertResult = { ok: boolean; failures: HiringDecisionAssertFailure[] };

function inRange(value: number, range: [number, number]) {
  return value >= range[0] && value <= range[1];
}

export function assertHiringDecisionSample(
  sample: HiringDecisionGoldenSample,
  decision: CandidateDecisionResultDto,
): HiringDecisionAssertResult {
  const failures: HiringDecisionAssertFailure[] = [];
  const exactFields = [
    ['hireDecision', decision.hireDecision, sample.expected.hireDecision],
    ['decisionScope', decision.decisionScope, sample.expected.decisionScope],
    ['riskAnalysis.level', decision.riskAnalysis.level, sample.expected.riskLevel],
    ['features.intentLevel', decision.features.intentLevel, sample.expected.intentLevel],
  ] as const;

  for (const [field, actual, expected] of exactFields) {
    if (actual !== expected)
      failures.push({ field, message: `expected ${expected}, got ${actual}` });
  }
  if (!inRange(decision.decisionTrace.weightedScore, sample.expected.weightedScoreRange)) {
    failures.push({
      field: 'decisionTrace.weightedScore',
      message: `expected ${sample.expected.weightedScoreRange.join('-')}, got ${decision.decisionTrace.weightedScore}`,
    });
  }
  if (!inRange(decision.confidence, sample.expected.confidenceRange)) {
    failures.push({
      field: 'confidence',
      message: `expected ${sample.expected.confidenceRange.join('-')}, got ${decision.confidence}`,
    });
  }
  for (const [key, range] of Object.entries(sample.expected.dimensionScoreRanges)) {
    if (!range) continue;
    const dimension = decision.dimensionAssessments.find((item) => item.key === key);
    if (!dimension || !inRange(dimension.score, range)) {
      failures.push({
        field: `dimensionAssessments.${key}`,
        message: `expected ${range.join('-')}, got ${dimension?.score ?? '<missing>'}`,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}
