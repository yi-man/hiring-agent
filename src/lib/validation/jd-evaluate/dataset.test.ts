/** @jest-environment node */

import {
  JD_EVALUATE_ANCHORS,
  JD_EVALUATE_DATASET_DESCRIPTION,
  JD_EVALUATE_DATASET_VERSION,
  listJdEvaluateDatasetSamples,
} from './dataset';

describe('jd evaluate golden dataset', () => {
  it('exposes 16 samples with 4 per anchor', () => {
    expect(JD_EVALUATE_DATASET_VERSION).toBe('jd-evaluate-golden-dataset-v1');
    expect(JD_EVALUATE_DATASET_DESCRIPTION).toContain('golden');
    const all = listJdEvaluateDatasetSamples();
    expect(all).toHaveLength(16);
    for (const anchor of JD_EVALUATE_ANCHORS) {
      expect(listJdEvaluateDatasetSamples({ anchor })).toHaveLength(4);
    }
  });

  it('keeps score ranges valid and rewriteRequired boolean or null', () => {
    for (const sample of listJdEvaluateDatasetSamples()) {
      for (const key of ['clarity', 'completeness', 'attractiveness', 'specificity'] as const) {
        const [lo, hi] = sample.expected.scoreRanges[key];
        expect(lo).toBeGreaterThanOrEqual(1);
        expect(hi).toBeLessThanOrEqual(10);
        expect(lo).toBeLessThanOrEqual(hi);
      }
      expect(
        sample.expected.rewriteRequired === null ||
          typeof sample.expected.rewriteRequired === 'boolean',
      ).toBe(true);
      expect(sample.jd.title.length).toBeGreaterThan(0);
      expect(sample.id.length).toBeGreaterThan(0);
    }
  });
});
