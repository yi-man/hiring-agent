import { runHiringDecisionValidationOp } from './ops';

describe('hiring decision validation ops', () => {
  it('shows the dataset and runs deterministic validation', () => {
    expect(runHiringDecisionValidationOp(['dataset'])).toEqual(
      expect.objectContaining({ exitCode: 0, detail: expect.stringContaining('strong_hire') }),
    );
    expect(runHiringDecisionValidationOp(['run'])).toEqual(
      expect.objectContaining({ exitCode: 0, detail: expect.stringContaining('全部通过') }),
    );
  });
});
