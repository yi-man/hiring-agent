import { runHiringDecisionGoldenDataset } from './runner';

describe('hiring decision golden dataset runner', () => {
  it('keeps every deterministic golden sample within its expected decision ranges', () => {
    const result = runHiringDecisionGoldenDataset();

    expect(result.samples.length).toBeGreaterThanOrEqual(3);
    expect(result.failed).toBe(0);
    expect(result.passed).toBe(result.samples.length);
  });
});
