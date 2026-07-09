import { runResumeScoringValidationOp } from './ops';

describe('resume scoring validation ops', () => {
  it('lists and exports the resume scoring golden dataset', () => {
    const listResult = runResumeScoringValidationOp(['dataset']);
    expect(listResult.operation).toBe('dataset');
    expect(listResult.detail).toEqual(expect.stringContaining('candidate-score-golden-dataset-v1'));
    expect(listResult.detail).toEqual(expect.stringContaining('technical'));

    const exportResult = runResumeScoringValidationOp(['dataset', 'export', 'technical']);
    const payload = JSON.parse(exportResult.detail) as {
      category: string;
      samples: Array<{ category: string }>;
    };
    expect(exportResult.operation).toBe('dataset');
    expect(payload.category).toBe('technical');
    expect(payload.samples.length).toBeGreaterThan(0);
  });
});
