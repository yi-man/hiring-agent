import {
  CANDIDATE_EVALUATION_DIMENSIONS,
  getCandidateEvaluationDimension,
} from './evaluation-dimensions';

describe('candidate evaluation dimensions', () => {
  it('defines a complete hiring rubric whose weights sum to one', () => {
    expect(CANDIDATE_EVALUATION_DIMENSIONS.map((dimension) => dimension.key)).toEqual([
      'core_competency',
      'problem_solving',
      'impact',
      'collaboration',
      'motivation',
    ]);
    expect(
      CANDIDATE_EVALUATION_DIMENSIONS.reduce((total, dimension) => total + dimension.weight, 0),
    ).toBeCloseTo(1, 8);
  });

  it('exposes one shared definition to interview and hiring-decision flows', () => {
    expect(getCandidateEvaluationDimension('core_competency')).toEqual(
      expect.objectContaining({ label: '核心任务胜任力', weight: 0.35 }),
    );
    expect(getCandidateEvaluationDimension('motivation')).toEqual(
      expect.objectContaining({ label: '动机与角色契合', weight: 0.1 }),
    );
  });
});
