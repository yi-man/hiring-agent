/** @jest-environment node */

import { runJdEvaluateValidationOp } from './ops';
import { runJdEvaluateGoldenRegression } from './run-ops';

describe('jd evaluate validation ops', () => {
  it('lists and exports the jd evaluate golden dataset', async () => {
    const listResult = await runJdEvaluateValidationOp(['dataset']);
    expect(listResult.operation).toBe('dataset');
    expect(listResult.exitCode).toBe(0);
    expect(listResult.detail).toEqual(expect.stringContaining('jd-evaluate-golden-dataset-v1'));
    expect(listResult.detail).toEqual(expect.stringContaining('high_quality'));

    const showResult = await runJdEvaluateValidationOp(['dataset', 'show', 'high_quality']);
    expect(showResult.exitCode).toBe(0);
    expect(showResult.detail).toEqual(expect.stringContaining('high-quality-backend-platform'));

    const exportResult = await runJdEvaluateValidationOp(['dataset', 'export', 'problematic']);
    expect(exportResult.exitCode).toBe(0);
    const parsed = JSON.parse(exportResult.detail) as { samples: unknown[] };
    expect(parsed.samples).toHaveLength(4);
  });

  it('rejects unknown anchors', async () => {
    const result = await runJdEvaluateValidationOp(['dataset', 'show', 'nope']);
    expect(result.exitCode).toBe(1);
    expect(result.detail).toEqual(expect.stringContaining('Unknown anchor'));
  });
});

describe('runJdEvaluateGoldenRegression', () => {
  it('passes with an injectable evaluator that matches expectations', async () => {
    const result = await runJdEvaluateGoldenRegression({
      anchor: 'high_quality',
      evaluate: async () => ({
        scores: { clarity: 9, completeness: 9, attractiveness: 8, specificity: 9 },
        issues: [],
        evidence: [],
        suggestions: [],
        rewrite_required: false,
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.detail).toContain('All samples passed');
    expect(result.detail).toContain('promptVersion:');
  });
});
