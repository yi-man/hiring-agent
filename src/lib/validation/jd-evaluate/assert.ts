import type { EvaluationResult } from '@/types';
import type { JdEvaluateGoldenSample } from './dataset';

export type JdEvaluateAssertFailure = {
  field: string;
  message: string;
};

export type JdEvaluateAssertResult = {
  ok: boolean;
  failures: JdEvaluateAssertFailure[];
};

function inRange(value: number, range: [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

export function assertJdEvaluateSample(
  sample: JdEvaluateGoldenSample,
  evaluation: EvaluationResult,
): JdEvaluateAssertResult {
  const failures: JdEvaluateAssertFailure[] = [];

  for (const key of ['clarity', 'completeness', 'attractiveness', 'specificity'] as const) {
    const score = evaluation.scores[key];
    const range = sample.expected.scoreRanges[key];
    if (!inRange(score, range)) {
      failures.push({
        field: `scores.${key}`,
        message: `expected ${range[0]}-${range[1]}, got ${score}`,
      });
    }
  }

  if (
    sample.expected.rewriteRequired !== null &&
    evaluation.rewrite_required !== sample.expected.rewriteRequired
  ) {
    failures.push({
      field: 'rewrite_required',
      message: `expected ${sample.expected.rewriteRequired}, got ${evaluation.rewrite_required}`,
    });
  }

  const joined = [
    ...(evaluation.issues ?? []),
    ...(evaluation.evidence ?? []),
    ...(evaluation.suggestions ?? []),
  ].join('\n');

  for (const needle of sample.expected.issueMustInclude ?? []) {
    if (!joined.includes(needle)) {
      failures.push({
        field: 'issueMustInclude',
        message: `missing substring: ${needle}`,
      });
    }
  }

  return { ok: failures.length === 0, failures };
}
