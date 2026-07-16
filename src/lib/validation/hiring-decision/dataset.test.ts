import {
  HIRING_DECISION_DATASET_DESCRIPTION,
  HIRING_DECISION_DATASET_SAMPLES,
  HIRING_DECISION_DATASET_VERSION,
  listHiringDecisionDatasetSamples,
} from './dataset';

describe('hiring decision validation dataset', () => {
  it('exposes golden samples across positive, cautious, and reject anchors', () => {
    expect(HIRING_DECISION_DATASET_VERSION).toBe('hiring-decision-golden-dataset-v1');
    expect(HIRING_DECISION_DATASET_DESCRIPTION).toContain('录用建议');
    expect(HIRING_DECISION_DATASET_SAMPLES.length).toBeGreaterThanOrEqual(3);
    expect(
      listHiringDecisionDatasetSamples({ anchor: 'strong_hire' }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(listHiringDecisionDatasetSamples({ anchor: 'reject' })).toHaveLength(1);
  });
});
