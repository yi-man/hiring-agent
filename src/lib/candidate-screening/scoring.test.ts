import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
} from './constants';
import { decideCandidateAction, scoreCandidate } from './scoring';

describe('candidate scoring', () => {
  it('computes weighted total and clamps it', () => {
    expect(
      scoreCandidate({ skill: 90, domain: 80, ability: 70, risk: 20, llmBonus: 5 }).total,
    ).toBe(76);
    expect(
      scoreCandidate({ skill: 200, domain: 100, ability: 100, risk: -50, llmBonus: 30 }).total,
    ).toBe(95);
  });

  it('limits LLM bonus to a small calibration adjustment', () => {
    expect(
      scoreCandidate({ skill: 70, domain: 70, ability: 70, risk: 0, llmBonus: 50 }),
    ).toMatchObject({
      llmBonus: 5,
      total: 68,
    });

    expect(
      scoreCandidate({ skill: 70, domain: 70, ability: 70, risk: 0, llmBonus: -50 }),
    ).toMatchObject({
      llmBonus: -5,
      total: 58,
    });
  });

  it('records the scoring rubric version with computed scores', () => {
    expect(
      scoreCandidate({ skill: 90, domain: 80, ability: 70, risk: 20, llmBonus: 5 }),
    ).toMatchObject({
      promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
      scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
      calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
      qualityPolicyVersion: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
    });
  });

  it('maps scores to decisions', () => {
    expect(decideCandidateAction(86)).toMatchObject({ action: 'chat', priority: 'high' });
    expect(decideCandidateAction(71)).toMatchObject({ action: 'chat', priority: 'medium' });
    expect(decideCandidateAction(61)).toMatchObject({ action: 'collect', priority: 'low' });
    expect(decideCandidateAction(60)).toMatchObject({ action: 'skip', priority: 'low' });
  });
});
