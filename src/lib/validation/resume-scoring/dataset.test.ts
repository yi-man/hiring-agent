import {
  CANDIDATE_SCORING_DATASET_DESCRIPTION,
  CANDIDATE_SCORING_DATASET_SAMPLES,
  CANDIDATE_SCORING_DATASET_VERSION,
  listCandidateScoringDatasetSamples,
} from './dataset';

describe('resume scoring validation dataset', () => {
  it('exposes the golden scoring samples from the validation module', () => {
    expect(CANDIDATE_SCORING_DATASET_VERSION).toBe('candidate-score-golden-dataset-v1');
    expect(CANDIDATE_SCORING_DATASET_DESCRIPTION).toContain('golden samples');
    expect(CANDIDATE_SCORING_DATASET_SAMPLES.length).toBeGreaterThan(0);
    expect(listCandidateScoringDatasetSamples({ category: 'technical' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'technical',
          expected: expect.objectContaining({ action: expect.any(String) }),
        }),
      ]),
    );
  });
});
